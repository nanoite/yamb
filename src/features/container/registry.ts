import type { DatabaseSync } from 'node:sqlite'

export interface ContainerRecord {
  alias: string
  type: string
  x: number
  y: number
  z: number
  dimension: string
  addedBy: string
  addedAt: string
}

export default class ContainerRegistry {
  private db: DatabaseSync

  constructor (db: DatabaseSync) {
    this.db = db
  }

  add (record: Omit<ContainerRecord, 'addedAt'> & { addedAt?: string }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO containers (alias, type, x, y, z, dimension, added_by, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.alias,
      record.type,
      record.x,
      record.y,
      record.z,
      record.dimension,
      record.addedBy,
      record.addedAt || new Date().toISOString()
    )
  }

  remove (alias: string): boolean {
    const result = this.db.prepare('DELETE FROM containers WHERE alias = ?').run(alias)
    return result.changes > 0
  }

  get (alias: string): ContainerRecord | null {
    const row = this.db.prepare(`
      SELECT alias, type, x, y, z, dimension,
             added_by AS addedBy, added_at AS addedAt
      FROM containers WHERE alias = ?
    `).get(alias) as ContainerRecord | undefined
    return row ?? null
  }

  list (): ContainerRecord[] {
    return this.db.prepare(`
      SELECT alias, type, x, y, z, dimension,
             added_by AS addedBy, added_at AS addedAt
      FROM containers ORDER BY alias
    `).all() as unknown as ContainerRecord[]
  }

  count (): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM containers').get() as { c: number }
    return row.c
  }
}
