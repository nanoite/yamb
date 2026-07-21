import type { ServiceResult, TeleportConfig, WaypointConfig } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import { sleep } from '../../platform/sleep'

export default class TeleportService {
  private mcBot: MinecraftBot
  private tpacceptCommand: string
  private tpahereCommand: string
  private phomeCommand: string
  private waypointByAlias: Map<string, string>
  private waypointDelayMs: number
  private locked = false
  private lockedBy: string | null = null

  constructor (mcBot: MinecraftBot, config: TeleportConfig) {
    this.mcBot = mcBot
    this.tpacceptCommand = config.tpacceptCommand
    this.tpahereCommand = config.tpahereCommand
    this.phomeCommand = config.phomeCommand
    this.waypointByAlias = new Map(
      config.waypoints.map(w => [w.alias, w.id])
    )
    this.waypointDelayMs = config.waypointDelayMs ?? 3000
  }

  isLocked (): boolean {
    return this.locked
  }

  getLockedBy (): string | null {
    return this.lockedBy
  }

  lock (by: string): void {
    this.locked = true
    this.lockedBy = by
    console.log(`[Teleport] Locked by ${by}`)
  }

  unlock (): void {
    this.locked = false
    this.lockedBy = null
    console.log('[Teleport] Unlocked')
  }

  canAcceptRequest (type: 'tpa' | 'tpahere'): boolean {
    if (type === 'tpa') return true
    return !this.locked
  }

  canUseWaypoint (): boolean {
    return !this.locked
  }

  listWaypointAliases (): string[] {
    return [...this.waypointByAlias.keys()].sort()
  }

  listWaypoints (): WaypointConfig[] {
    return [...this.waypointByAlias.entries()]
      .map(([alias, id]) => ({ alias, id }))
      .sort((a, b) => a.alias.localeCompare(b.alias))
  }

  resolveWaypointId (alias: string): string | null {
    return this.waypointByAlias.get(alias) ?? null
  }

  async acceptRequest (playerName: string, type: 'tpa' | 'tpahere'): Promise<ServiceResult> {
    if (!this.mcBot.isReady) {
      return { success: false, message: '机器人未就绪', code: 'not_ready' }
    }

    try {
      this.mcBot.chat(`${this.tpacceptCommand} ${playerName}`)
      console.log(`[Teleport] Auto-accepted ${type} from ${playerName}`)
      return { success: true }
    } catch (err) {
      console.error('[Teleport] Accept error:', (err as Error).message)
      return { success: false, message: (err as Error).message }
    }
  }

  async goToPlayerViaWaypoint (playerName: string, alias: string): Promise<ServiceResult> {
    if (!this.mcBot.isReady) {
      return { success: false, message: '机器人未就绪', code: 'not_ready' }
    }
    if (!this.canUseWaypoint()) {
      return {
        success: false,
        code: 'locked',
        lockedBy: this.lockedBy,
        message: 'bot 已锁定，无法使用传送点'
      }
    }

    const waypointId = this.resolveWaypointId(alias)
    if (!waypointId) {
      const available = this.listWaypointAliases()
      const hint = available.length > 0 ? `可用: ${available.join(', ')}` : '未配置传送点'
      return {
        success: false,
        code: 'unknown_waypoint',
        message: `未知传送点 "${alias}"，${hint}`
      }
    }

    try {
      this.mcBot.chat(`${this.phomeCommand} ${waypointId}`)
      console.log(`[Teleport] Sent ${this.phomeCommand} ${waypointId} (${alias}) for ${playerName}`)
      await sleep(this.waypointDelayMs)
      this.mcBot.chat(`${this.tpahereCommand} ${playerName}`)
      console.log(`[Teleport] Sent ${this.tpahereCommand} ${playerName} via ${alias}`)
      return { success: true }
    } catch (err) {
      console.error('[Teleport] Waypoint error:', (err as Error).message)
      return { success: false, message: (err as Error).message }
    }
  }
}
