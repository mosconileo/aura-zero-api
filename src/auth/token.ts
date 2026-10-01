import { createHash, randomBytes } from 'node:crypto'

// Token opaco de alta entropia: sha256 basta (não é senha escolhida por humano,
// bcrypt/argon2 só adicionariam latência em toda request).
export function newToken (): string {
  return 'kj_' + randomBytes(32).toString('base64url')
}

export function hashToken (token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
