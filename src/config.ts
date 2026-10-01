import { z } from 'zod'

// Falha no boot com mensagem clara em vez de um undefined no meio de uma request.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  CORS_ORIGIN: z.string().default('http://localhost:5183'),
  SENTRY_DSN: z.string().optional().transform((v) => v || undefined),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv (source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    throw new Error('Variaveis de ambiente invalidas:\n' + z.prettifyError(parsed.error))
  }
  return parsed.data
}

export const ENV = Symbol('ENV')
