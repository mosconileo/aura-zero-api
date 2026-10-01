import type { Env } from '../src/config.js'

// Banco e database do Redis exclusivos de teste (ver docker/init-test-db.sql).
// Em CI, as variáveis TEST_* apontam para os services do workflow.
export const TEST_ENV: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://aura:aura@localhost:5433/aura_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6380/1',
  CORS_ORIGIN: 'http://localhost:5183',
  SENTRY_DSN: undefined,
}
