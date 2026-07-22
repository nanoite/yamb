export interface MinecraftConfig {
  host: string
  port: number
  username: string | undefined
  password: string | undefined
  auth: string
  profilesFolder: string
  version: string | false
  checkTimeoutInterval: number
}

export interface AstrbotConfig {
  enabled: boolean
  port: number
  apiKey: string | undefined
}

export interface MessagesConfig {
  emptyCommand?: string
  unknownCommand?: string
  noPermission?: string
  phomeUsage?: string
  phomeError?: string
  lockedBlocked?: string
  lockAlready?: string
  lockUsage?: string
  lockSuccess?: string
  lockHoverSuccess?: string
  lockHoverFailed?: string
  unlockNotLocked?: string
  unlockSuccess?: string
  addUsage?: string
  addAlready?: string
  addSuccess?: string
  removeUsage?: string
  removeNotFound?: string
  removeSuccess?: string
  statusLines?: string[]
  statusLocked?: string
  statusUnlocked?: string
  statusIdle?: string
  statusRidingPlayer?: string
  statusRidingMinecart?: string
  sayUsage?: string
  saySuccess?: string
  sayError?: string
  forwardUsage?: string
  forwardSuccess?: string
  forwardEmpty?: string
  forwardError?: string
  mountUsage?: string
  mountSuccess?: string
  mountError?: string
  mountAlready?: string
  unmountSuccess?: string
  unmountError?: string
  cartSuccess?: string
  cartError?: string
  invHeader?: string
  invEmpty?: string
  invError?: string
  storeUsage?: string
  storeSuccess?: string
  storeError?: string
  takeUsage?: string
  takeSuccess?: string
  takeError?: string
  dropUsage?: string
  dropSuccess?: string
  dropError?: string
  attackUsage?: string
  attackSuccess?: string
  attackError?: string
  containerAddUsage?: string
  containerAddSuccess?: string
  containerRemoveUsage?: string
  containerRemoveSuccess?: string
  containerRemoveNotFound?: string
  containerListEmpty?: string
  containerListHeader?: string
  containerListEntry?: string
  containerInfoUsage?: string
  containerInfoNotFound?: string
  containerInfoLines?: string[]
  containerNoTarget?: string
  helpLines?: string[]
}

export interface CommandConfig {
  prefix: string
  whisperCommand: string
  allowPublicCommands: boolean
  replyAlwaysWhisper: boolean
  messages: MessagesConfig
}

export interface WaypointConfig {
  id: string
  alias: string
}

export interface TeleportConfig {
  databaseFile: string
  tpacceptCommand: string
  tpahereCommand: string
  phomeCommand: string
  waypoints: WaypointConfig[]
  waypointDelayMs?: number
}

export interface BotBehaviorConfig {
  idleTimeoutMs: number
  idleCheckIntervalMs: number
  homeCommand: string
  afkCommand: string
  afkDelayMs: number
  homeWaitMs: number
  replyDelayMs: number
  interactionDistance: number
  approachDistance: number
  forwardWaitMs: number
  ridingCheckIntervalMs: number
}

export interface ViewerConfig {
  enabled: boolean
  port: number
  firstPerson: boolean
  viewDistance: number
}

export interface BrewConfig {
  enabled: boolean
}

export interface MessageQueueConfig {
  maxSize: number
  delayMs: number
}

export interface AppConfig {
  minecraft: MinecraftConfig
  astrbot: AstrbotConfig
  adminList: string[]
  command: CommandConfig
  teleport: TeleportConfig
  bot: BotBehaviorConfig
  viewer: ViewerConfig
  brew: BrewConfig
  messageQueue: MessageQueueConfig
}

export interface ServiceResult {
  success: boolean
  message?: string
  code?: 'locked' | 'not_ready' | 'unknown_waypoint'
  lockedBy?: string | null
}

export interface PlayersResult extends ServiceResult {
  players?: string[]
  count?: number
}

export interface StatusResult extends ServiceResult {
  minecraft?: boolean
  username?: string | null
  uptime?: number
  whitelist_count?: number
}

export interface WhitelistEntry {
  addedBy: string
  addedAt: string
}

export type WhitelistData = Record<string, WhitelistEntry>

export interface QueueTask {
  message: string
  sender: string | null
  timestamp: number
}

export interface QueueStatus {
  size: number
  isProcessing: boolean
  isLocked: boolean
  maxSize: number
}

