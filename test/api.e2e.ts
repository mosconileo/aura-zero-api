import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eventually, type Harness, matchBody, register, reset, startApp } from './harness.js'

let h: Harness

beforeAll(async () => { h = await startApp() })
afterAll(async () => { await h.app.close() })
beforeEach(async () => { await reset(h) })

const auth = (token: string) => ({ authorization: `Bearer ${token}` })

describe('health', () => {
  it('reporta banco e redis', async () => {
    const res = await h.http.get('/health').expect(200)
    expect(res.body).toEqual({ status: 'ok', database: true, redis: true })
  })
})

describe('players', () => {
  it('registra e devolve o token uma unica vez (banco guarda so o hash)', async () => {
    const res = await h.http.post('/players').send({ nickname: 'leo' }).expect(201)
    expect(res.body.token).toMatch(/^az_/)
    const row = await h.prisma.player.findUniqueOrThrow({ where: { id: res.body.player.id } })
    expect(row.tokenHash).not.toContain(res.body.token)
  })

  it('nickname duplicado vira 409, invalido vira 400 com o campo', async () => {
    await register(h, 'leo')
    await h.http.post('/players').send({ nickname: 'leo' }).expect(409)
    const bad = await h.http.post('/players').send({ nickname: 'a b' }).expect(400)
    expect(bad.body.issues[0].path).toBe('nickname')
  })

  it('rotas autenticadas rejeitam token ausente ou falso', async () => {
    await h.http.get('/players/me').expect(401)
    await h.http.get('/players/me').set(auth('az_falso')).expect(401)
  })

  it('perfil inexistente vira 404', async () => {
    await h.http.get('/players/nao-existe').expect(404)
  })
})

describe('matches', () => {
  it('registra a luta e aplica o rating', async () => {
    const p = await register(h, 'leo')
    const res = await h.http.post('/matches').set(auth(p.token))
      .send(matchBody({ difficulty: 'DIFICIL' })).expect(201)
    expect(res.body.ratingDelta).toBe(25)
    const me = await h.http.get('/players/me').set(auth(p.token)).expect(200)
    expect(me.body.rating).toBe(1025)
    expect(me.body.stats).toMatchObject({ matches: 1, wins: 1, winRate: 100 })
  })

  it('reenvio com o mesmo clientMatchId e idempotente: 200, mesma luta, rating uma vez', async () => {
    const p = await register(h, 'leo')
    const body = matchBody()
    const first = await h.http.post('/matches').set(auth(p.token)).send(body).expect(201)
    const again = await h.http.post('/matches').set(auth(p.token)).send(body).expect(200)
    expect(again.body.id).toBe(first.body.id)
    expect(await h.prisma.match.count()).toBe(1)
    expect((await h.prisma.player.findUniqueOrThrow({ where: { id: p.id } })).rating).toBe(1015)
  })

  it('reenvios CONCORRENTES da mesma luta gravam exatamente uma', async () => {
    const p = await register(h, 'leo')
    const body = matchBody()
    const results = await Promise.all(
      Array.from({ length: 8 }, () => h.http.post('/matches').set(auth(p.token)).send(body)),
    )
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 201])
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1)
    expect(await h.prisma.match.count()).toBe(1)
    expect((await h.prisma.player.findUniqueOrThrow({ where: { id: p.id } })).rating).toBe(1015)
  })

  it('lutas distintas concorrentes nao perdem atualizacao de rating (FOR UPDATE)', async () => {
    const p = await register(h, 'leo')
    await Promise.all(
      Array.from({ length: 10 }, () => h.http.post('/matches').set(auth(p.token)).send(matchBody()).expect(201)),
    )
    expect((await h.prisma.player.findUniqueOrThrow({ where: { id: p.id } })).rating).toBe(1000 + 10 * 15)
  })

  it('valida o corpo com mensagens por campo', async () => {
    const p = await register(h, 'leo')
    const field = await h.http.post('/matches').set(auth(p.token))
      .send(matchBody({ fighterId: 'goku', maxCombo: -1 })).expect(400)
    expect(field.body.issues.map((i: { path: string }) => i.path)).toEqual(['fighterId', 'maxCombo'])

    // Regras cruzadas (placar x resultado) rodam quando os campos já são válidos.
    const cross = await h.http.post('/matches').set(auth(p.token))
      .send(matchBody({ roundsWon: 1 })).expect(400)
    expect(cross.body.issues).toEqual([{ path: 'roundsWon', message: 'placar incompativel com o resultado' }])
  })

  it('pagina por cursor sem pular nem repetir', async () => {
    const p = await register(h, 'leo')
    for (let i = 0; i < 25; i++) {
      await h.http.post('/matches').set(auth(p.token)).send(matchBody()).expect(201)
    }
    const seen: string[] = []
    let cursor: string | null = null
    const sizes: number[] = []
    do {
      const res: { body: { items: { id: string }[]; nextCursor: string | null } } = await h.http.get(`/players/${p.id}/matches`).query({ limit: 10, ...(cursor ? { cursor } : {}) }).expect(200)
      sizes.push(res.body.items.length)
      seen.push(...res.body.items.map((m) => m.id))
      cursor = res.body.nextCursor
    } while (cursor)
    expect(sizes).toEqual([10, 10, 5])
    expect(new Set(seen).size).toBe(25)
  })

  it('cursor adulterado vira 400', async () => {
    const p = await register(h, 'leo')
    await h.http.get(`/players/${p.id}/matches`).query({ cursor: 'lixo' }).expect(400)
  })
})

describe('achievements (worker BullMQ)', () => {
  it('desbloqueia de forma assincrona e nao duplica', async () => {
    const p = await register(h, 'leo')
    const body = matchBody({ mode: 'ARCADE', difficulty: 'DIFICIL', boss: true, roundsLost: 0, hpRemaining: 900, maxCombo: 11 })
    const res = await h.http.post('/matches').set(auth(p.token)).send(body).expect(201)

    const list = await eventually(
      () => h.http.get('/players/me/achievements').set(auth(p.token)).then((r) => r.body as { achievementCode: string; matchId: string }[]),
      (l) => l.length >= 5,
    )
    expect(list.map((a) => a.achievementCode).sort())
      .toEqual(['COMBO_10', 'FIRST_WIN', 'FLAWLESS', 'GIANT_SLAYER', 'HARD_WIN'])
    expect(list.every((a) => a.matchId === res.body.id)).toBe(true)

    // Segunda vitória perfeita: nada novo, nada duplicado.
    await h.http.post('/matches').set(auth(p.token)).send({ ...body, clientMatchId: crypto.randomUUID() }).expect(201)
    await new Promise((r) => setTimeout(r, 500))
    expect(await h.prisma.playerAchievement.count({ where: { playerId: p.id } })).toBe(5)
  })
})

describe('leaderboard (Redis sorted set)', () => {
  it('ordena por rating', async () => {
    const a = await register(h, 'alpha')
    const b = await register(h, 'beta')
    await h.http.post('/matches').set(auth(b.token)).send(matchBody({ difficulty: 'DIFICIL' })).expect(201)
    await h.http.post('/matches').set(auth(a.token)).send(matchBody({ result: 'LOSS', roundsWon: 0, roundsLost: 2 })).expect(201)

    const res = await h.http.get('/leaderboard').expect(200)
    expect(res.body.items.map((e: { nickname: string }) => e.nickname)).toEqual(['beta', 'alpha'])
    expect(res.body.items[0]).toMatchObject({ rank: 1, rating: 1025 })
  })

  it('se o set sumir do Redis, e reconstruido do Postgres', async () => {
    const a = await register(h, 'alpha')
    await h.http.post('/matches').set(auth(a.token)).send(matchBody()).expect(201)
    await h.redis.flushdb()

    const res = await h.http.get('/leaderboard').expect(200)
    expect(res.body.items).toEqual([{ rank: 1, playerId: a.id, nickname: 'alpha', rating: 1015 }])
  })
})

describe('fighters + reviews', () => {
  it('avaliacao e upsert por jogador e invalida o cache do catalogo', async () => {
    const p = await register(h, 'leo')
    const before = await h.http.get('/fighters').expect(200)
    expect(before.body.items.find((f: { id: string }) => f.id === 'kael').avgRating).toBeNull()

    await h.http.put('/fighters/kael/review').set(auth(p.token)).send({ rating: 2 }).expect(200)
    await h.http.put('/fighters/kael/review').set(auth(p.token)).send({ rating: 5, comment: 'rapido demais' }).expect(200)

    const after = await h.http.get('/fighters').expect(200)
    expect(after.body.items.find((f: { id: string }) => f.id === 'kael')).toMatchObject({ avgRating: 5, reviews: 1 })
    const reviews = await h.http.get('/fighters/kael/reviews').expect(200)
    expect(reviews.body.items[0]).toMatchObject({ rating: 5, comment: 'rapido demais', player: { nickname: 'leo' } })
  })

  it('lutador inexistente vira 404 e nota fora de 1..5 vira 400', async () => {
    const p = await register(h, 'leo')
    await h.http.put('/fighters/goku/review').set(auth(p.token)).send({ rating: 4 }).expect(404)
    await h.http.put('/fighters/kael/review').set(auth(p.token)).send({ rating: 6 }).expect(400)
  })
})
