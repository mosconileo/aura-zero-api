import { z } from 'zod'
import { FIGHTER_IDS } from '../domain/catalog.js'

const fighter = z.enum(FIGHTER_IDS)
const int = (max: number) => z.number().int().min(0).max(max)

// Limites são sanidade, não anti-cheat: o cliente é um jogo local e o
// resultado é declarado por ele. Ver "Limitações" no README.
export const CreateMatchSchema = z.object({
  clientMatchId: z.uuid(),
  mode: z.enum(['VERSUS_CPU', 'ARCADE']),
  difficulty: z.enum(['FACIL', 'NORMAL', 'DIFICIL']),
  fighterId: fighter,
  opponentId: fighter,
  result: z.enum(['WIN', 'LOSS']),
  roundsWon: int(2),
  roundsLost: int(2),
  maxCombo: int(999),
  damageDealt: int(1_000_000),
  hpRemaining: int(100_000),
  hpMax: z.number().int().min(1).max(100_000),
  boss: z.boolean().default(false),
  durationMs: z.number().int().min(1_000).max(60 * 60 * 1000),
}).superRefine((m, ctx) => {
  // Melhor de 3: o vencedor tem exatamente 2 rounds.
  const ok = m.result === 'WIN' ? m.roundsWon === 2 && m.roundsLost <= 1 : m.roundsLost === 2 && m.roundsWon <= 1
  if (!ok) ctx.addIssue({ code: 'custom', path: ['roundsWon'], message: 'placar incompativel com o resultado' })
  if (m.hpRemaining > m.hpMax) ctx.addIssue({ code: 'custom', path: ['hpRemaining'], message: 'maior que hpMax' })
  if (m.boss && m.mode !== 'ARCADE') ctx.addIssue({ code: 'custom', path: ['boss'], message: 'chefe so existe no arcade' })
})

export type CreateMatch = z.infer<typeof CreateMatchSchema>

export const PageQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type PageQuery = z.infer<typeof PageQuerySchema>
