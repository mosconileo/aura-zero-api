// Paginação por cursor (keyset) sobre (createdAt DESC, id DESC).
// Offset pula ou repete itens quando lutas novas entram durante a navegação;
// keyset não, e usa o índice composto em vez de varrer N linhas.

export interface Cursor { createdAt: Date; id: string }

export function encodeCursor (c: Cursor): string {
  return Buffer.from(JSON.stringify([c.createdAt.toISOString(), c.id])).toString('base64url')
}

/** Retorna null para cursor malformado (o controller responde 400). */
export function decodeCursor (raw: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2) return null
    const [iso, id] = parsed
    if (typeof iso !== 'string' || typeof id !== 'string' || id === '') return null
    const createdAt = new Date(iso)
    if (Number.isNaN(createdAt.getTime())) return null
    return { createdAt, id }
  } catch {
    return null
  }
}

/** Filtro Prisma: itens estritamente "depois" do cursor na ordem DESC. */
export function afterCursor (c: Cursor) {
  return {
    OR: [
      { createdAt: { lt: c.createdAt } },
      { createdAt: c.createdAt, id: { lt: c.id } },
    ],
  }
}

/** Busca limit+1 para saber se há próxima página sem um COUNT extra. */
export function page<T extends Cursor> (rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null }
}
