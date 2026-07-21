import type { DatabaseSync } from 'node:sqlite'
import type { WhitelistData, WhitelistEntry } from '../types'

export default class Whitelist {
  private db: DatabaseSync

  constructor (db: DatabaseSync) {
    this.db = db
  }

  add (gameName: string, addedBy?: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO whitelist (game_name, added_by, added_at) VALUES (?, ?, ?)'
    ).run(gameName, addedBy || 'system', new Date().toISOString())
  }

  remove (gameName: string): void {
    this.db.prepare('DELETE FROM whitelist WHERE game_name = ?').run(gameName)
  }

  isAllowed (gameName: string): boolean {
    const row = this.db.prepare('SELECT 1 AS ok FROM whitelist WHERE game_name = ?').get(gameName) as { ok: number } | undefined
    return row !== undefined
  }

  get (gameName: string): WhitelistEntry | null {
    const row = this.db.prepare(
      'SELECT added_by AS addedBy, added_at AS addedAt FROM whitelist WHERE game_name = ?'
    ).get(gameName) as WhitelistEntry | undefined
    return row ?? null
  }

  list (): WhitelistData {
    const rows = this.db.prepare(
      'SELECT game_name AS gameName, added_by AS addedBy, added_at AS addedAt FROM whitelist ORDER BY game_name'
    ).all() as Array<{ gameName: string; addedBy: string; addedAt: string }>

    const result: WhitelistData = {}
    for (const row of rows) {
      result[row.gameName] = { addedBy: row.addedBy, addedAt: row.addedAt }
    }
    return result
  }

  count (): number {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM whitelist').get() as { c: number }
    return row.c
  }
}
