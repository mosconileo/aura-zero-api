import { describe, expect, it } from 'vitest'
import { type MatchFacts, evaluateAchievements } from './achievements.js'
import { FIGHTER_IDS } from './catalog.js'

const win: MatchFacts = {
  won: true, roundsLost: 1, maxCombo: 3, hpRemaining: 100, hpMax: 1000, difficulty: 'NORMAL', boss: false,
}
const loss: MatchFacts = { ...win, won: false, roundsLost: 2 }
const totals = (matches = 1, winning: string[] = []) => ({ matches, winningFighters: new Set(winning) })
const none = new Set<string>()

describe('evaluateAchievements', () => {
  it('derrota comum nao desbloqueia nada', () => {
    expect(evaluateAchievements(loss, totals(), none)).toEqual([])
  })

  it('primeira vitoria apertada: FIRST_WIN + COMEBACK', () => {
    expect(evaluateAchievements(win, totals(1, ['kael']), none)).toEqual(['FIRST_WIN', 'COMEBACK'])
  })

  it('FLAWLESS exige 0 rounds perdidos E 80% da vida', () => {
    const perfect = { ...win, roundsLost: 0, hpRemaining: 800 }
    expect(evaluateAchievements(perfect, totals(), none)).toContain('FLAWLESS')
    expect(evaluateAchievements({ ...perfect, hpRemaining: 799 }, totals(), none)).not.toContain('FLAWLESS')
    expect(evaluateAchievements({ ...perfect, roundsLost: 1 }, totals(), none)).not.toContain('FLAWLESS')
  })

  it('combo de 10 conta mesmo perdendo a luta', () => {
    expect(evaluateAchievements({ ...loss, maxCombo: 10 }, totals(), none)).toEqual(['COMBO_10'])
  })

  it('HARD_WIN e GIANT_SLAYER so com vitoria', () => {
    const bossWin = { ...win, difficulty: 'DIFICIL' as const, boss: true }
    expect(evaluateAchievements(bossWin, totals(), none)).toEqual(expect.arrayContaining(['HARD_WIN', 'GIANT_SLAYER']))
    expect(evaluateAchievements({ ...bossWin, won: false }, totals(), none)).toEqual([])
  })

  it('VETERAN na 50a luta', () => {
    expect(evaluateAchievements(loss, totals(49), none)).not.toContain('VETERAN')
    expect(evaluateAchievements(loss, totals(50), none)).toContain('VETERAN')
  })

  it('ROSTER_MASTER exige vitoria com todo o elenco', () => {
    const allButOne = FIGHTER_IDS.slice(1)
    expect(evaluateAchievements(win, totals(10, allButOne), none)).not.toContain('ROSTER_MASTER')
    expect(evaluateAchievements(win, totals(10, [...FIGHTER_IDS]), none)).toContain('ROSTER_MASTER')
  })

  it('nao repete conquista ja desbloqueada', () => {
    expect(evaluateAchievements(win, totals(), new Set(['FIRST_WIN']))).toEqual(['COMEBACK'])
  })
})
