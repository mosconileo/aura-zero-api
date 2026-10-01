import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import type { Queue } from 'bullmq'
import { afterCursor, decodeCursor, page } from '../domain/cursor.js'
import { applyDelta, ratingDelta } from '../domain/rating.js'
import { Prisma, type Match } from '../generated/prisma/client.js'
import { cacheKeys, CacheService } from '../infra/cache.service.js'
import { PrismaService } from '../infra/prisma.service.js'
import { LeaderboardService } from '../leaderboard/leaderboard.service.js'
import { ACHIEVEMENTS_QUEUE, type EvaluateJob } from '../achievements/achievements.queue.js'
import type { CreateMatch, PageQuery } from './matches.schema.js'

@Injectable()
export class MatchesService {
  private readonly logger = new Logger('Matches')

  constructor (
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly cache: CacheService,
    @InjectQueue(ACHIEVEMENTS_QUEUE) private readonly queue: Queue<EvaluateJob>,
  ) {}

  /**
   * Registra uma luta. Idempotente por (playerId, clientMatchId): o jogo
   * reenvia lutas que falharam por rede, e o reenvio não pode duplicar a luta
   * nem aplicar o rating duas vezes.
   */
  async record (playerId: string, input: CreateMatch): Promise<{ match: Match; created: boolean }> {
    const existing = await this.findByClientId(playerId, input.clientMatchId)
    if (existing) return { match: existing, created: false }

    let match: Match
    let newRating: number
    try {
      ;({ match, newRating } = await this.prisma.$transaction(async (tx) => {
        // FOR UPDATE serializa lutas concorrentes do mesmo jogador: sem isso,
        // duas requests leem o mesmo rating e uma atualização se perde.
        const [row] = await tx.$queryRaw<{ rating: number }[]>`
          SELECT rating FROM "Player" WHERE id = ${playerId} FOR UPDATE`
        if (!row) throw new BadRequestException({ error: 'player_not_found' })

        const { rating, applied } = applyDelta(row.rating, ratingDelta({
          won: input.result === 'WIN', difficulty: input.difficulty, boss: input.boss,
        }))
        await tx.player.update({ where: { id: playerId }, data: { rating } })
        const created = await tx.match.create({ data: { ...input, playerId, ratingDelta: applied } })
        return { match: created, newRating: rating }
      }))
    } catch (err) {
      // Corrida de reenvio: duas requests com o mesmo clientMatchId passaram
      // pelo findByClientId. A unique constraint barra a segunda e o rollback
      // desfaz o rating dela. Devolvemos a luta que ganhou.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.findByClientId(playerId, input.clientMatchId)
        if (winner) return { match: winner, created: false }
      }
      throw err
    }

    // Efeitos derivados, depois do commit. Falha aqui não perde dado:
    // ranking se reconstrói do banco e o job tem retry.
    await Promise.all([
      this.leaderboard.setRating(playerId, newRating),
      this.cache.invalidate(cacheKeys.profile(playerId), cacheKeys.fighters),
      this.queue.add('evaluate', { matchId: match.id }, {
        jobId: match.id, // dedupe: a mesma luta nunca é avaliada em dobro
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      }).catch((err) => this.logger.error(`enfileirar conquistas da luta ${match.id} falhou`, err)),
    ])

    return { match, created: true }
  }

  async listForPlayer (playerId: string, q: PageQuery) {
    const cursor = q.cursor ? decodeCursor(q.cursor) : null
    if (q.cursor && !cursor) throw new BadRequestException({ error: 'invalid_cursor' })

    const rows = await this.prisma.match.findMany({
      where: { playerId, ...(cursor ? afterCursor(cursor) : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    })
    return page(rows, q.limit)
  }

  private findByClientId (playerId: string, clientMatchId: string) {
    return this.prisma.match.findUnique({ where: { playerId_clientMatchId: { playerId, clientMatchId } } })
  }
}
