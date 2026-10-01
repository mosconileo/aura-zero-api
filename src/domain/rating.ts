// Rating contra a CPU. Não é Elo (o oponente não tem rating): o peso vem da
// dificuldade. Vencer no difícil vale mais; perder no fácil custa mais.

export type Difficulty = 'FACIL' | 'NORMAL' | 'DIFICIL'

const WIN_POINTS: Record<Difficulty, number> = { FACIL: 8, NORMAL: 15, DIFICIL: 25 }
const LOSS_POINTS: Record<Difficulty, number> = { FACIL: 15, NORMAL: 10, DIFICIL: 5 }
const BOSS_BONUS = 10

export function ratingDelta (input: { won: boolean; difficulty: Difficulty; boss: boolean }): number {
  if (input.won) return WIN_POINTS[input.difficulty] + (input.boss ? BOSS_BONUS : 0)
  return -LOSS_POINTS[input.difficulty]
}

/** Rating nunca fica negativo: o delta efetivo é cortado no piso. */
export function applyDelta (current: number, delta: number): { rating: number; applied: number } {
  const rating = Math.max(0, current + delta)
  return { rating, applied: rating - current }
}
