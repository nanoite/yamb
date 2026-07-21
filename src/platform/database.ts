import { DatabaseSync } from 'node:sqlite'
import fs from 'fs'
import path from 'path'

let db: DatabaseSync | null = null

export function initDatabase (dbPath: string): DatabaseSync {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS whitelist (
      game_name TEXT PRIMARY KEY,
      added_by  TEXT NOT NULL,
      added_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS containers (
      alias     TEXT PRIMARY KEY,
      type      TEXT NOT NULL,
      x         INTEGER NOT NULL,
      y         INTEGER NOT NULL,
      z         INTEGER NOT NULL,
      dimension TEXT NOT NULL DEFAULT 'overworld',
      added_by  TEXT NOT NULL,
      added_at  TEXT NOT NULL
    )
  `)

  console.log(`[DB] SQLite ready: ${dbPath}`)
  return db
}

export function getDatabase (): DatabaseSync {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDatabase (): void {
  if (db) {
    db.close()
    db = null
  }
}

/** 从旧版 whitelist.json 迁移数据（仅当表为空时） */
export function migrateFromJson (jsonPath: string): void {
  const database = getDatabase()
  const count = database.prepare('SELECT COUNT(*) AS c FROM whitelist').get() as { c: number }
  if (count.c > 0) return

  if (!fs.existsSync(jsonPath)) return

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Record<string, { addedBy?: string; addedAt?: string }>
    const insert = database.prepare(
      'INSERT OR IGNORE INTO whitelist (game_name, added_by, added_at) VALUES (?, ?, ?)'
    )

    database.exec('BEGIN')
    try {
      let migrated = 0
      for (const [name, info] of Object.entries(data)) {
        insert.run(name, info.addedBy || 'migration', info.addedAt || new Date().toISOString())
        migrated++
      }
      database.exec('COMMIT')
      if (migrated > 0) {
        console.log(`[DB] Migrated ${migrated} entries from ${jsonPath}`)
      }
    } catch (err) {
      database.exec('ROLLBACK')
      throw err
    }
  } catch (err) {
    console.warn('[DB] JSON migration skipped:', (err as Error).message)
  }
}

export type { DatabaseSync }
