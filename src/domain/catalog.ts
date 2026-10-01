// Catálogo estático. Fonte da verdade do roster é o jogo
// (Fight Club/src/fighters/roster.js); o seed espelha estes ids no banco.

export const FIGHTERS = [
  { id: 'kael', name: 'KAEL' },
  { id: 'zeren', name: 'ZEREN' },
  { id: 'myra', name: 'MYRA' },
  { id: 'gorvax', name: 'GORVAX' },
  { id: 'nyx', name: 'NYX' },
  { id: 'toru', name: 'TORU' },
] as const

export type FighterId = (typeof FIGHTERS)[number]['id']
export const FIGHTER_IDS = FIGHTERS.map((f) => f.id) as [FighterId, ...FighterId[]]

export const ACHIEVEMENTS = [
  { code: 'FIRST_WIN', name: 'Primeiro Sangue', description: 'Venca sua primeira luta.' },
  { code: 'FLAWLESS', name: 'Impecavel', description: 'Venca sem perder round e com 80% da vida.' },
  { code: 'COMBO_10', name: 'Corrente', description: 'Acerte um combo de 10 hits.' },
  { code: 'COMEBACK', name: 'Virada', description: 'Venca depois de perder um round.' },
  { code: 'HARD_WIN', name: 'Sem Piedade', description: 'Venca uma luta no dificil.' },
  { code: 'GIANT_SLAYER', name: 'Mata-Titas', description: 'Derrote o chefe do arcade.' },
  { code: 'VETERAN', name: 'Veterano', description: 'Complete 50 lutas.' },
  { code: 'ROSTER_MASTER', name: 'Mestre do Elenco', description: 'Venca com todos os lutadores.' },
] as const

export type AchievementCode = (typeof ACHIEVEMENTS)[number]['code']
