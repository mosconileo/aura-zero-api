import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor, page } from './cursor.js'

const at = (s: number, id: string) => ({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, s)), id })

describe('cursor', () => {
  it('ida e volta preserva data e id', () => {
    const c = at(5, 'abc')
    expect(decodeCursor(encodeCursor(c))).toEqual(c)
  })

  it.each([
    ['lixo', 'nao-e-base64-json'],
    ['json que nao e array', Buffer.from('{"a":1}').toString('base64url')],
    ['data invalida', Buffer.from('["ontem","abc"]').toString('base64url')],
    ['id vazio', Buffer.from('["2026-01-01T00:00:00.000Z",""]').toString('base64url')],
  ])('rejeita %s', (_, raw) => {
    expect(decodeCursor(raw)).toBeNull()
  })

  it('page devolve nextCursor so quando ha item alem do limite', () => {
    const rows = [at(3, 'c'), at(2, 'b'), at(1, 'a')]
    const first = page(rows, 2)
    expect(first.items.map((r) => r.id)).toEqual(['c', 'b'])
    expect(decodeCursor(first.nextCursor!)).toEqual(at(2, 'b'))
    expect(page(rows, 3).nextCursor).toBeNull()
  })
})
