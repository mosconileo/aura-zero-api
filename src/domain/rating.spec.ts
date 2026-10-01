import { describe, expect, it } from 'vitest'
import { applyDelta, ratingDelta } from './rating.js'

describe('ratingDelta', () => {
  it('vitoria vale mais quanto maior a dificuldade', () => {
    const f = ratingDelta({ won: true, difficulty: 'FACIL', boss: false })
    const n = ratingDelta({ won: true, difficulty: 'NORMAL', boss: false })
    const d = ratingDelta({ won: true, difficulty: 'DIFICIL', boss: false })
    expect(f).toBeLessThan(n)
    expect(n).toBeLessThan(d)
  })

  it('derrota custa mais quanto menor a dificuldade', () => {
    expect(ratingDelta({ won: false, difficulty: 'FACIL', boss: false })).toBe(-15)
    expect(ratingDelta({ won: false, difficulty: 'DIFICIL', boss: false })).toBe(-5)
  })

  it('chefe soma bonus so na vitoria', () => {
    expect(ratingDelta({ won: true, difficulty: 'DIFICIL', boss: true })).toBe(35)
    expect(ratingDelta({ won: false, difficulty: 'DIFICIL', boss: true })).toBe(-5)
  })
})

describe('applyDelta', () => {
  it('aplica o delta normalmente', () => {
    expect(applyDelta(1000, 25)).toEqual({ rating: 1025, applied: 25 })
  })

  it('corta no piso zero e reporta o delta realmente aplicado', () => {
    expect(applyDelta(4, -15)).toEqual({ rating: 0, applied: -4 })
    expect(applyDelta(0, -15)).toEqual({ rating: 0, applied: 0 })
  })
})
