import type { ServiceResult, TeleportConfig, WaypointConfig } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import { jumpAndHover } from '../../actions/shared/entity-utils'
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
  private hoverLocked = false
  private beforeLock: (() => Promise<void>) | null = null
  private onLock: (() => void) | null = null
  private onUnlock: ((info: { wasHover: boolean }) => void) | null = null

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

  /** 锁定前钩子（例如骑乘时先下马，保证空闲/骑乘/锁定互斥） */
  setBeforeLock (beforeLock: () => Promise<void>): void {
    this.beforeLock = beforeLock
  }

  setOnLock (onLock: () => void): void {
    this.onLock = onLock
  }

  setOnUnlock (onUnlock: (info: { wasHover: boolean }) => void): void {
    this.onUnlock = onUnlock
  }

  isLocked (): boolean {
    return this.locked
  }

  isHoverLocked (): boolean {
    return this.locked && this.hoverLocked
  }

  getLockedBy (): string | null {
    return this.lockedBy
  }

  /**
   * 进入锁定：先执行 beforeLock；
   * options.hover 时先滞空再锁定。
   */
  async prepareAndLock (
    by: string,
    options?: { hover?: boolean }
  ): Promise<{ success: boolean; code?: 'already' | 'not_ready' | 'hover_failed' }> {
    if (this.locked) return { success: false, code: 'already' }
    if (this.beforeLock) await this.beforeLock()

    if (options?.hover) {
      const bot = this.mcBot.bot
      if (!bot || !this.mcBot.isReady) {
        return { success: false, code: 'not_ready' }
      }
      const hovered = await jumpAndHover(bot)
      if (!hovered) return { success: false, code: 'hover_failed' }
      this.hoverLocked = true
    } else {
      this.hoverLocked = false
    }

    this.lock(by)
    return { success: true }
  }

  lock (by: string): void {
    this.locked = true
    this.lockedBy = by
    this.onLock?.()
    console.log(`[Teleport] Locked by ${by}${this.hoverLocked ? ' (hover)' : ''}`)
  }

  unlock (): { wasHover: boolean } {
    const wasHover = this.hoverLocked
    this.locked = false
    this.lockedBy = null
    this.hoverLocked = false
    this.onUnlock?.({ wasHover })
    console.log(`[Teleport] Unlocked${wasHover ? ' (resume physics)' : ''}`)
    return { wasHover }
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
