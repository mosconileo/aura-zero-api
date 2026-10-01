import { BadRequestException, Injectable } from '@nestjs/common'
import { afterCursor, decodeCursor, page } from '../domain/cursor.js'
import { cacheKeys, CacheService } from '../infra/cache.service.js'
import { PrismaService } from '../infra/prisma.service.js'
import type { PageQuery } from '../matches/matches.schema.js'

@Injectable()
export class FightersService {
  constructor (private readonly prisma: PrismaService, private readonly cache: CacheService) {}

  /** Catálogo com nota média e taxa de vitória. Muda pouco: cache de 5 min + invalidação. */
  list () {
    return this.cache.getOrSet(cacheKeys.fighters, 300, async () => {
      const [fighters, ratings, picks, wins] = await Promise.all([
        this.prisma.fighter.findMany({ orderBy: { id: 'asc' } }),
        this.prisma.review.groupBy({ by: ['fighterId'], _avg: { rating: true }, _count: { _all: true } }),
        this.prisma.match.groupBy({ by: ['fighterId'], _count: { _all: true } }),
        this.prisma.match.groupBy({ by: ['fighterId'], where: { result: 'WIN' }, _count: { _all: true } }),
      ])
      const idx = <T extends { fighterId: string }>(rows: T[]) => new Map(rows.map((r) => [r.fighterId, r]))
      const [r, p, w] = [idx(ratings), idx(picks), idx(wins)]

      return fighters.map((f) => {
        const played = p.get(f.id)?._count._all ?? 0
        const won = w.get(f.id)?._count._all ?? 0
        const avg = r.get(f.id)?._avg.rating
        return {
          ...f,
          reviews: r.get(f.id)?._count._all ?? 0,
          avgRating: avg == null ? null : Math.round(avg * 10) / 10,
          matches: played,
          winRate: played === 0 ? null : Math.round((won / played) * 1000) / 10,
        }
      })
    })
  }

  /** PUT semântico: uma avaliação por jogador por lutador; reenviar substitui. */
  async upsertReview (playerId: string, fighterId: string, data: { rating: number; comment?: string }) {
    await this.ensureFighter(fighterId)
    const review = await this.prisma.review.upsert({
      where: { playerId_fighterId: { playerId, fighterId } },
      update: data,
      create: { ...data, playerId, fighterId },
    })
    await this.cache.invalidate(cacheKeys.fighters)
    return review
  }

  async reviews (fighterId: string, q: PageQuery) {
    await this.ensureFighter(fighterId)
    const cursor = q.cursor ? decodeCursor(q.cursor) : null
    if (q.cursor && !cursor) throw new BadRequestException({ error: 'invalid_cursor' })

    const rows = await this.prisma.review.findMany({
      where: { fighterId, ...(cursor ? afterCursor(cursor) : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      select: { id: true, rating: true, comment: true, createdAt: true, updatedAt: true, player: { select: { id: true, nickname: true } } },
    })
    return page(rows, q.limit)
  }

  private async ensureFighter (id: string) {
    // findUniqueOrThrow → P2025 → 404 no filtro global.
    await this.prisma.fighter.findUniqueOrThrow({ where: { id }, select: { id: true } })
  }
}
