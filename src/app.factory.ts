import { type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module.js'
import type { Env } from './config.js'

/** Mesma montagem para produção e para a suíte e2e. */
export async function createApp (env: Env): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule.forRoot(env), { bufferLogs: true })
  app.useLogger(app.get(Logger))
  app.enableCors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()) })
  app.enableShutdownHooks()
  return app
}
