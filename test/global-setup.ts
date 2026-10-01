import { execSync } from 'node:child_process'
import { TEST_ENV } from './env.js'

/** Aplica as migrations no banco de teste e semeia o catálogo, uma vez por execução. */
export default function setup () {
  const env = { ...process.env, DATABASE_URL: TEST_ENV.DATABASE_URL }
  execSync('npx prisma migrate deploy', { env, stdio: 'inherit' })
  execSync('node --import tsx prisma/seed.ts', { env, stdio: 'inherit' })
}
