import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { Redis } from 'ioredis'
import { ENV, type Env } from '../config.js'

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor (@Inject(ENV) env: Env) {
    // Comandos falham rápido em vez de enfileirar para sempre se o Redis cair:
    // o cache é otimização, a request não pode ficar presa nele.
    super(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false })
  }

  async onModuleDestroy () {
    await this.quit().catch(() => this.disconnect())
  }
}

/** Parse da REDIS_URL no formato que o BullMQ espera. */
export function redisConnection (url: string) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password || undefined,
    username: u.username || undefined,
    db: Number(u.pathname.slice(1) || 0),
  }
}
