import { Injectable, Logger } from '@nestjs/common'
import { RedisService } from './redis.js'

/**
 * Cache-aside tolerante a falha: se o Redis estiver fora, cai direto no
 * loader. Cache é otimização; indisponibilidade dele não pode virar 500.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger('Cache')

  constructor (private readonly redis: RedisService) {}

  async getOrSet<T> (key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    try {
      const hit = await this.redis.get(key)
      if (hit !== null) return JSON.parse(hit) as T
    } catch (err) {
      this.logger.warn(`get ${key} falhou, servindo do banco: ${String(err)}`)
      return loader()
    }

    const value = await loader()
    this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
      .catch((err) => this.logger.warn(`set ${key} falhou: ${String(err)}`))
    return value
  }

  async invalidate (...keys: string[]): Promise<void> {
    if (keys.length === 0) return
    await this.redis.del(...keys).catch((err) => this.logger.warn(`del falhou: ${String(err)}`))
  }
}

export const cacheKeys = {
  fighters: 'cache:fighters:v1',
  profile: (playerId: string) => `cache:profile:v1:${playerId}`,
}
