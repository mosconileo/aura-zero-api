import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { evaluateAchievements } from '../domain/achievements.js'
import { cacheKeys, CacheService } from '../infra/cache.service.js'
import { PrismaService } from '../infra/prisma.service.js'
import { ACHIEVEMENTS_QUEUE, type EvaluateJob } from './achievements.queue.js'

/**
 * Avalia conquistas fora do caminho da request: POST /matches responde sem
 * esperar os agregados. Reprocessar a mesma luta é seguro (PK composta +
 * skipDuplicates), então retry nunca duplica conquista.
 */
@Processor(ACHIEVEMENTS_QUEUE)
export class AchievementsProcessor extends WorkerHost {
  private readonly logger = new Logger('Achievements')

  constructor (private readonly prisma: PrismaService, private readonly cache: CacheService) {
    super()
  }

  async process (job: Job<EvaluateJob>): Promise<string[]> {
    const match = await this.prisma.match.findUnique({ where: { id: job.data.matchId } })
    if (!match) return [] // luta apagada (cascade do jogador): nada a fazer

    const [matches, winningFighters, unlocked] = await Promise.all([
      this.prisma.match.count({ where: { playerId: match.playerId } }),
      this.prisma.match.findMany({
        where: { playerId: match.playerId, result: 'WIN' },
        distinct: ['fighterId'],
        select: { fighterId: true },
      }),
      this.prisma.playerAchievement.findMany({
        where: { playerId: match.playerId },
        select: { achievementCode: true },
      }),
    ])

    const codes = evaluateAchievements(
      { ...match, won: match.result === 'WIN' },
      { matches, winningFighters: new Set(winningFighters.map((w) => w.fighterId)) },
      new Set(unlocked.map((u) => u.achievementCode)),
    )
    if (codes.length === 0) return []

    await this.prisma.playerAchievement.createMany({
      data: codes.map((achievementCode) => ({ playerId: match.playerId, achievementCode, matchId: match.id })),
      skipDuplicates: true,
    })
    await this.cache.invalidate(cacheKeys.profile(match.playerId))
    this.logger.log(`luta ${match.id}: ${codes.join(', ')}`)
    return codes
  }
}
