import fs from 'fs'
import path from 'path'
import type { AppConfig, MessagesConfig, WaypointConfig } from '../types'

const PROJECT_ROOT = path.join(__dirname, '..', '..')
const GAME_CONFIG_DIR = path.join(PROJECT_ROOT, 'config', 'game')

function envBool (value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') return defaultValue
  return value === 'true' || value === '1'
}

function envInt (value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') return defaultValue
  return parseInt(value, 10)
}

function stripJsonComments (text: string): string {
  let result = ''
  let i = 0
  let inString = false
  let escape = false

  while (i < text.length) {
    const char = text[i]
    const next = text[i + 1]

    if (inString) {
      result += char
      if (escape) {
        escape = false
      } else if (char === '\\') {
        escape = true
      } else if (char === '"') {
        inString = false
      }
      i++
      continue
    }

    if (char === '"') {
      inString = true
      result += char
      i++
      continue
    }

    if (char === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }

    if (char === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }

    result += char
    i++
  }

  return result
}

function readJson<T> (filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[Config] File not found: ${filePath}`)
      return null
    }
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(stripJsonComments(raw)) as T
  } catch (err) {
    console.warn(`[Config] Failed to read ${filePath}:`, (err as Error).message)
    return null
  }
}

function resolvePath (relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  return path.join(PROJECT_ROOT, relativePath)
}

function parseAdminList (value: string | undefined): string[] {
  if (!value?.trim()) return []
  return value.split(',').map(name => name.trim()).filter(Boolean)
}

function loadMessagesConfig (): MessagesConfig {
  const messagesPath = path.join(GAME_CONFIG_DIR, 'messages.json')
  const messages = readJson<MessagesConfig>(messagesPath)
  if (!messages) {
    console.error('[Config] Error: config/game/messages.json is required')
    process.exit(1)
  }
  return messages
}

function loadEnvConfig (): Pick<AppConfig, 'minecraft' | 'astrbot' | 'messageQueue' | 'adminList'> {
  const mcVersion = process.env.MC_VERSION
  const password = process.env.MC_PASSWORD?.trim()
  return {
    minecraft: {
      host: process.env.MC_HOST || 'mc.zenoxs.cn',
      port: envInt(process.env.MC_PORT, 25565),
      username: process.env.MC_USERNAME,
      password: password || undefined,
      auth: process.env.MC_AUTH || 'microsoft',
      profilesFolder: resolvePath(process.env.MC_PROFILES_FOLDER || './mc-tokens'),
      version: !mcVersion || mcVersion === 'false' ? false : mcVersion,
      checkTimeoutInterval: envInt(process.env.MC_CHECK_TIMEOUT, 300000)
    },
    astrbot: {
      enabled: envBool(process.env.ASTRBOT_ENABLED, false),
      port: envInt(process.env.API_PORT, 15100),
      apiKey: process.env.API_KEY
    },
    messageQueue: {
      maxSize: envInt(process.env.QUEUE_MAX_SIZE, 100),
      delayMs: envInt(process.env.QUEUE_DELAY_MS, 1000)
    },
    adminList: parseAdminList(process.env.MC_ADMIN_LIST)
  }
}

function normalizeWaypoints (raw: unknown): WaypointConfig[] {
  if (!Array.isArray(raw)) return []

  const waypoints: WaypointConfig[] = []
  for (const item of raw) {
    if (typeof item === 'string') {
      waypoints.push({ id: item, alias: item })
      continue
    }
    if (item && typeof item === 'object') {
      const w = item as Partial<WaypointConfig>
      const id = w.id?.trim()
      const alias = w.alias?.trim()
      if (id && alias) waypoints.push({ id, alias })
    }
  }
  return waypoints
}

function loadFeatureConfig (): Pick<AppConfig, 'command' | 'teleport' | 'bot' | 'viewer' | 'brew'> {
  const commandPath = path.join(GAME_CONFIG_DIR, 'command.json')
  const teleportPath = path.join(GAME_CONFIG_DIR, 'teleport.json')
  const botPath = path.join(GAME_CONFIG_DIR, 'bot.json')
  const viewerPath = path.join(GAME_CONFIG_DIR, 'viewer.json')
  const brewPath = path.join(GAME_CONFIG_DIR, 'brew.json')

  const commandConfig = readJson<Partial<AppConfig['command']>>(commandPath) ?? {}
  const teleportConfig = readJson<Partial<AppConfig['teleport']>>(teleportPath) ?? {}
  const botConfig = readJson<Partial<AppConfig['bot']>>(botPath) ?? {}
  const viewerConfig = readJson<Partial<AppConfig['viewer']>>(viewerPath) ?? {}
  const brewConfig = readJson<Partial<AppConfig['brew']>>(brewPath) ?? {}
  const messages = loadMessagesConfig()

  console.log(`[Config] Game config dir: ${GAME_CONFIG_DIR}`)
  console.log(`[Config] command.json -> prefix="${commandConfig.prefix ?? '(default #ybot)'}"`)

  const prefix = commandConfig.prefix || '#ybot'

  return {
    command: {
      prefix,
      whisperCommand: commandConfig.whisperCommand || '/msg',
      allowPublicCommands: commandConfig.allowPublicCommands ?? false,
      replyAlwaysWhisper: commandConfig.replyAlwaysWhisper ?? true,
      messages
    },
    teleport: {
      databaseFile: teleportConfig.databaseFile || './data/mchatbot.db',
      tpacceptCommand: teleportConfig.tpacceptCommand || '/tpaccept',
      tpahereCommand: teleportConfig.tpahereCommand || '/tpahere',
      phomeCommand: teleportConfig.phomeCommand || '/phome',
      waypoints: normalizeWaypoints(teleportConfig.waypoints),
      waypointDelayMs: teleportConfig.waypointDelayMs ?? 3000
    },
    bot: {
      idleTimeoutMs: botConfig.idleTimeoutMs ?? 90000,
      idleCheckIntervalMs: botConfig.idleCheckIntervalMs ?? 10000,
      homeCommand: botConfig.homeCommand || '/home',
      afkCommand: botConfig.afkCommand || '/afk',
      afkDelayMs: botConfig.afkDelayMs ?? 500,
      homeWaitMs: botConfig.homeWaitMs ?? 3000,
      replyDelayMs: botConfig.replyDelayMs ?? 500,
      interactionDistance: botConfig.interactionDistance ?? (botConfig as { mountRange?: number }).mountRange ?? 3,
      approachDistance: botConfig.approachDistance ?? 10,
      forwardWaitMs: botConfig.forwardWaitMs ?? (botConfig as { fwdWaitMs?: number }).fwdWaitMs ?? 2000,
      ridingCheckIntervalMs: botConfig.ridingCheckIntervalMs ?? 1500
    },
    viewer: {
      enabled: viewerConfig.enabled ?? false,
      port: viewerConfig.port ?? 3007,
      firstPerson: viewerConfig.firstPerson ?? false,
      viewDistance: viewerConfig.viewDistance ?? 6
    },
    brew: {
      enabled: brewConfig.enabled ?? false
    }
  }
}

export function loadConfig (): AppConfig {
  return { ...loadEnvConfig(), ...loadFeatureConfig() }
}

export function validateConfig (config: AppConfig): void {
  if (!config.minecraft.username) {
    console.error('[Config] Error: MC_USERNAME is required in .env')
    process.exit(1)
  }

  if (config.astrbot.enabled && !config.astrbot.apiKey) {
    console.error('[Config] Error: API_KEY is required in .env when ASTRBOT_ENABLED=true')
    process.exit(1)
  }
}

export function resolveDataPath (relativePath: string): string {
  return path.join(PROJECT_ROOT, relativePath)
}

export { PROJECT_ROOT, GAME_CONFIG_DIR }
