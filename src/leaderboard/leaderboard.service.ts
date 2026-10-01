import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../infra/prisma.service.js'
import { RedisService } from '../infra/redis.js'

const KEY = 'leaderboard:rating'

export interface LeaderboardEntry { rank: number; playerId: string; nickname: string; rating: number }

/**
 * Ranking em sorted set (ZADD O(log n), top-N O(log n + N)).
 * O Postgres é a fonte da verdade: o set é derivado, pode ser apagado e é
 * reconstruído sob demanda. Se o Redis cair, a leitura cai para o banco.
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger('Leaderboard')

  constructor (private readonly redis: RedisService, private readonly prisma: PrismaService) {}

  async setRating (playerId: string, rating: number): Promise<void> {
    await this.redis.zadd(KEY, rating, playerId)
      .catch((err) => this.logger.warn(`zadd falhou (rebuild corrige depois): ${String(err)}`))
  }

  async top (limit: number): Promise<LeaderboardEntry[]> {
    let ids: string[]
    try {
      if (!(await this.redis.exists(KEY))) await this.rebuild()
      ids = await this.redis.zrevrange(KEY, 0, limit - 1)
    } catch (err) {
      this.logger.warn(`redis indisponivel, ranking via banco: ${String(err)}`)
      return this.topFromDb(limit)
    }

    // Uma query para hidratar nicknames, ordem preservada pelo array do Redis.
    const players = await this.prisma.player.findMany({
      where: { id: { in: ids } },
      select: { id: true, nickname: true, rating: true },
    })
    const byId = new Map(players.map((p) => [p.id, p]))
    return ids.flatMap((id, i) => {
      const p = byId.get(id)
      return p ? [{ rank: i + 1, playerId: p.id, nickname: p.nickname, rating: p.rating }] : []
    })
  }

  /** Posição 1-based, ou null fora do ranking / Redis fora. */
  async rankOf (playerId: string): Promise<number | null> {
    try {
      if (!(await this.redis.exists(KEY))) await this.rebuild()
      const r = await this.redis.zrevrank(KEY, playerId)
      return r === null ? null : r + 1
    } catch {
      return null
    }
  }

  async rebuild (): Promise<void> {
    const players = await this.prisma.player.findMany({ select: { id: true, rating: true } })
    const tmp = `${KEY}:rebuild:${process.pid}:${Date.now()}`
    const multi = this.redis.multi()
    for (let i = 0; i < players.length; i += 1000) {
      const chunk = players.slice(i, i + 1000).flatMap((p) => [p.rating, p.id])
      multi.zadd(tmp, ...chunk)
    }
    // RENAME atômico: leitores nunca veem um ranking pela metade.
    if (players.length > 0) multi.rename(tmp, KEY)
    await multi.exec()
    this.logger.log(`ranking reconstruido com ${players.length} jogadores`)
  }

  private async topFromDb (limit: number): Promise<LeaderboardEntry[]> {
    const rows = await this.prisma.player.findMany({
      orderBy: [{ rating: 'desc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, nickname: true, rating: true },
    })
    return rows.map((p, i) => ({ rank: i + 1, playerId: p.id, nickname: p.nickname, rating: p.rating }))
  }
}
