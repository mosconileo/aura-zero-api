import { describe, expect, it } from 'vitest'
import { CreateMatchSchema } from './matches.schema.js'

const valid = {
  clientMatchId: '7f3c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f',
  mode: 'VERSUS_CPU', difficulty: 'NORMAL', fighterId: 'kael', opponentId: 'nyx',
  result: 'WIN', roundsWon: 2, roundsLost: 1, maxCombo: 7, damageDealt: 1500,
  hpRemaining: 300, hpMax: 1000, durationMs: 90_000,
}

const issuesOf = (input: object) => {
  const r = CreateMatchSchema.safeParse(input)
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('CreateMatchSchema', () => {
  it('aceita uma luta valida e aplica default de boss', () => {
    const r = CreateMatchSchema.parse(valid)
    expect(r.boss).toBe(false)
  })

  it('rejeita lutador fora do elenco', () => {
    expect(issuesOf({ ...valid, fighterId: 'goku' })).toContain('fighterId')
  })

  it('rejeita placar incompativel com o resultado (melhor de 3)', () => {
    expect(issuesOf({ ...valid, roundsWon: 1 })).toContain('roundsWon')
    expect(issuesOf({ ...valid, result: 'LOSS' })).toContain('roundsWon')
  })

  it('rejeita vida restante maior que a maxima', () => {
    expect(issuesOf({ ...valid, hpRemaining: 1001 })).toContain('hpRemaining')
  })

  it('chefe so existe no arcade', () => {
    expect(issuesOf({ ...valid, boss: true })).toContain('boss')
    expect(issuesOf({ ...valid, boss: true, mode: 'ARCADE' })).toEqual([])
  })

  it('exige clientMatchId uuid (chave de idempotencia)', () => {
    expect(issuesOf({ ...valid, clientMatchId: '123' })).toContain('clientMatchId')
  })
})
