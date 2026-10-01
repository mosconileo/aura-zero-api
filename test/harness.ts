import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createApp } from '../src/app.factory.js'
import { PrismaService } from '../src/infra/prisma.service.js'
import { RedisService } from '../src/infra/redis.js'
import { TEST_ENV } from './env.js'

export interface Harness {
  app: INestApplication
  http: ReturnType<typeof request>
  prisma: PrismaService
  redis: RedisService
}

export async function startApp (): Promise<Harness> {
  const app = await createApp(TEST_ENV)
  await app.init()
  return {
    app,
    http: request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    redis: app.get(RedisService),
  }
}

/** Estado limpo entre testes; o catálogo (lutadores, conquistas) fica. */
export async function reset (h: Harness) {
  await h.prisma.$executeRawUnsafe('TRUNCATE "Player", "Match", "PlayerAchievement", "Review" CASCADE')
  await h.redis.flushdb()
}

export async function register (h: Harness, nickname: string) {
  const res = await h.http.post('/players').send({ nickname }).expect(201)
  return { id: res.body.player.id as string, token: res.body.token as string }
}

export function matchBody (overrides: Record<string, unknown> = {}) {
  return {
    clientMatchId: randomUUID(),
    mode: 'VERSUS_CPU', difficulty: 'NORMAL', fighterId: 'kael', opponentId: 'nyx',
    result: 'WIN', roundsWon: 2, roundsLost: 1, maxCombo: 4, damageDealt: 1500,
    hpRemaining: 300, hpMax: 1000, boss: false, durationMs: 90_000,
    ...overrides,
  }
}

/** Espera até a condição valer (jobs assíncronos), com prazo. */
export async function eventually<T> (fn: () => Promise<T>, ok: (v: T) => boolean, ms = 5000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (ok(v) || Date.now() > end) return v
    await new Promise((r) => setTimeout(r, 100))
  }
}
