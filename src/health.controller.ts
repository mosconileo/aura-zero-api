import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from './infra/prisma.service.js'
import { RedisService } from './infra/redis.js'

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

/** Readiness para o orquestrador: 503 se uma dependência não responde em 1s. */
@Controller('health')
export class HealthController {
  constructor (private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Get()
  async check () {
    const [db, cache] = await Promise.allSettled([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, 1000),
      withTimeout(this.redis.ping(), 1000),
    ])
    const status = { database: db.status === 'fulfilled', redis: cache.status === 'fulfilled' }
    if (!status.database || !status.redis) throw new ServiceUnavailableException({ error: 'unhealthy', ...status })
    return { status: 'ok', ...status }
  }
}
