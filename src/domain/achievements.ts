import type { AchievementCode, FighterId } from './catalog.js'
import { FIGHTER_IDS } from './catalog.js'

export interface MatchFacts {
  won: boolean
  roundsLost: number
  maxCombo: number
  hpRemaining: number
  hpMax: number
  difficulty: 'FACIL' | 'NORMAL' | 'DIFICIL'
  boss: boolean
}

/** Agregados do jogador JÁ incluindo a luta avaliada. */
export interface PlayerTotals {
  matches: number
  winningFighters: ReadonlySet<FighterId | string>
}

type Rule = (m: MatchFacts, t: PlayerTotals) => boolean

const RULES: Record<AchievementCode, Rule> = {
  FIRST_WIN: (m) => m.won,
  FLAWLESS: (m) => m.won && m.roundsLost === 0 && m.hpMax > 0 && m.hpRemaining / m.hpMax >= 0.8,
  COMBO_10: (m) => m.maxCombo >= 10,
  COMEBACK: (m) => m.won && m.roundsLost >= 1,
  HARD_WIN: (m) => m.won && m.difficulty === 'DIFICIL',
  GIANT_SLAYER: (m) => m.won && m.boss,
  VETERAN: (_m, t) => t.matches >= 50,
  ROSTER_MASTER: (_m, t) => FIGHTER_IDS.every((id) => t.winningFighters.has(id)),
}

/**
 * Conquistas que esta luta satisfaz, menos as que o jogador já tem.
 * Função pura: idempotência de verdade fica na chave primária do banco.
 */
export function evaluateAchievements (
  match: MatchFacts,
  totals: PlayerTotals,
  alreadyUnlocked: ReadonlySet<string>,
): AchievementCode[] {
  return (Object.keys(RULES) as AchievementCode[])
    .filter((code) => !alreadyUnlocked.has(code) && RULES[code](match, totals))
}
