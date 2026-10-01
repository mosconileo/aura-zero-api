import { Injectable, NotFoundException } from '@nestjs/common'
import { hashToken, newToken } from '../auth/token.js'
import { cacheKeys, CacheService } from '../infra/cache.service.js'
import { PrismaService } from '../infra/prisma.service.js'
import { LeaderboardService } from '../leaderboard/leaderboard.service.js'

@Injectable()
export class PlayersService {
  constructor (
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly leaderboard: LeaderboardService,
  ) {}

  /** O token só existe nesta resposta: o banco guarda o hash. Nickname duplicado vira 409 no filtro. */
  async register (nickname: string) {
    const token = newToken()
    const player = await this.prisma.player.create({
      data: { nickname, tokenHash: hashToken(token) },
      select: { id: true, nickname: true, rating: true, createdAt: true },
    })
    await this.leaderboard.setRating(player.id, player.rating)
    return { player, token }
  }

  /** Perfil agregado. Cache curto, invalidado por nova luta ou conquista. */
  async profile (playerId: string) {
    const profile = await this.cache.getOrSet(cacheKeys.profile(playerId), 60, () => this.loadProfile(playerId))
    if (!profile) throw new NotFoundException({ error: 'player_not_found' })
    // Rank fica fora do cache: muda quando QUALQUER jogador luta.
    return { ...profile, rank: await this.leaderboard.rankOf(playerId) }
  }

  achievements (playerId: string) {
    return this.prisma.playerAchievement.findMany({
      where: { playerId },
      orderBy: { unlockedAt: 'desc' },
      select: { achievementCode: true, matchId: true, unlockedAt: true, achievement: { select: { name: true, description: true } } },
    })
  }

  private async loadProfile (playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, nickname: true, rating: true, createdAt: true },
    })
    if (!player) return null

    const [byResult, byFighter, best, achievements] = await Promise.all([
      this.prisma.match.groupBy({ by: ['result'], where: { playerId }, _count: { _all: true } }),
      this.prisma.match.groupBy({
        by: ['fighterId'], where: { playerId }, _count: { _all: true },
        orderBy: { _count: { fighterId: 'desc' } }, take: 1,
      }),
      this.prisma.match.aggregate({ where: { playerId }, _max: { maxCombo: true } }),
      this.prisma.playerAchievement.count({ where: { playerId } }),
    ])

    const wins = byResult.find((r) => r.result === 'WIN')?._count._all ?? 0
    const losses = byResult.find((r) => r.result === 'LOSS')?._count._all ?? 0
    const total = wins + losses
    return {
      ...player,
      stats: {
        matches: total,
        wins,
        losses,
        winRate: total === 0 ? 0 : Math.round((wins / total) * 1000) / 10,
        bestCombo: best._max.maxCombo ?? 0,
        favoriteFighter: byFighter[0]?.fighterId ?? null,
        achievements,
      },
    }
  }
}
