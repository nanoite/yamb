import type { Bot } from 'mineflayer'
import type { BotBehaviorConfig } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import type PlayerInteractionService from '../../actions/player'
import {
  clearVehicleState,
  hasActiveVehicle,
  isMountedOnMinecart,
  isMountedOnPlayer,
  isOnPluginCloudSeat,
  isStillRidingPlayer,
  performDismount,
  settleOnGround
} from '../../actions/shared/entity-utils'
import { sleep } from '../../platform/sleep'

export type RidingMode = 'idle' | 'player' | 'minecart'

type Entity = NonNullable<Bot['entities'][string]>

export default class RidingManager {
  private mcBot: MinecraftBot
  private playerInteraction: PlayerInteractionService
  private isLocked: () => boolean = () => false
  private onBehaviorEnd: (() => void) | null = null
  private homeCommand: string
  private checkIntervalMs: number
  private mode: RidingMode = 'idle'
  private targetPlayer: string | null = null
  private dismountRequested = false
  /** 主动下马后短时间内禁止自动重骑，避免与 dismount 事件竞态 */
  private remountSuppressedUntil = 0
  private handlingDismount = false
  private notMountedStreak = 0
  private monitorTimer: ReturnType<typeof setInterval> | null = null
  private listenersAttached = false

  constructor (
    mcBot: MinecraftBot,
    playerInteraction: PlayerInteractionService,
    botConfig: BotBehaviorConfig
  ) {
    this.mcBot = mcBot
    this.playerInteraction = playerInteraction
    this.homeCommand = botConfig.homeCommand
    this.checkIntervalMs = botConfig.ridingCheckIntervalMs ?? 1500
  }

  setIsLocked (isLocked: () => boolean): void {
    this.isLocked = isLocked
  }

  setOnBehaviorEnd (onBehaviorEnd: () => void): void {
    this.onBehaviorEnd = onBehaviorEnd
  }

  getMode (): RidingMode {
    return this.mode
  }

  isActive (): boolean {
    return this.mode !== 'idle'
  }

  getTargetPlayer (): string | null {
    return this.targetPlayer
  }

  enterPlayerMode (playerName: string): void {
    if (this.isLocked()) {
      console.warn('[Riding] 已锁定，拒绝进入骑乘模式')
      return
    }
    this.mode = 'player'
    this.targetPlayer = playerName
    this.dismountRequested = false
    this.remountSuppressedUntil = 0
    this.notMountedStreak = 0
    console.log(`[Riding] 进入骑乘模式 -> ${playerName}`)
  }

  enterMinecartMode (): void {
    if (this.isLocked()) {
      console.warn('[Riding] 已锁定，拒绝进入矿车模式')
      return
    }
    this.mode = 'minecart'
    this.targetPlayer = null
    this.dismountRequested = false
    this.remountSuppressedUntil = 0
    this.notMountedStreak = 0
    console.log('[Riding] 进入矿车模式')
  }

  clearMode (): void {
    if (this.mode === 'idle') return
    console.log(`[Riding] 退出 ${this.mode} 模式`)
    this.mode = 'idle'
    this.targetPlayer = null
    this.handlingDismount = false
    this.notMountedStreak = 0
    const bot = this.mcBot.bot
    if (bot) clearVehicleState(bot)
  }

  private isRemountSuppressed (): boolean {
    return this.dismountRequested || Date.now() < this.remountSuppressedUntil
  }

  async dismount (): Promise<{ success: boolean; message: string }> {
    const bot = this.mcBot.bot
    if (!bot || this.mode === 'idle') {
      return { success: false, message: '当前未处于骑乘状态' }
    }

    const mode = this.mode
    const targetPlayer = this.targetPlayer
    const isStillMounted = (): boolean => {
      if (mode === 'player' && targetPlayer) {
        return isStillRidingPlayer(bot, targetPlayer)
      }
      if (mode === 'minecart') {
        return isMountedOnMinecart(bot)
      }
      return false
    }

    this.dismountRequested = true
    this.remountSuppressedUntil = Date.now() + 5000

    try {
      // 离开云座后立刻清模式，避免 settle 期间 status 仍显示「骑乘」
      const ok = await performDismount(bot, isStillMounted)
      const stillOnSeat = hasActiveVehicle(bot) || isOnPluginCloudSeat(bot)
      const stillMounted = isStillMounted()

      if (!stillOnSeat && !stillMounted) {
        this.clearMode()
        this.onBehaviorEnd?.()
        return { success: true, message: '已下马' }
      }

      if (ok) {
        this.clearMode()
        this.onBehaviorEnd?.()
        return { success: true, message: '已下马' }
      }

      console.warn('[Riding] 主动下马失败，仍处于骑乘位置', {
        ok,
        stillOnSeat,
        stillMounted
      })
      return { success: false, message: '下马失败，请重试（可尝试潜行或再发 unmount）' }
    } finally {
      this.dismountRequested = false
    }
  }

  start (): void {
    const bot = this.mcBot.bot
    if (!bot || this.listenersAttached) return
    this.listenersAttached = true

    bot.on('dismount', () => {
      void this.onDismountEvent()
    })

    bot.on('mount', () => {
      if (this.isRemountSuppressed()) return
      this.notMountedStreak = 0
    })

    bot.on('entityAttach', (entity: Entity, vehicle: Entity) => {
      if (entity !== bot.entity) return
      if (this.isRemountSuppressed()) return
      this.notMountedStreak = 0
      console.log(`[Riding] entityAttach -> ${vehicle.name || vehicle.username || vehicle.id}`)
    })

    bot.on('entityDetach', (entity: Entity) => {
      if (entity !== bot.entity || this.isRemountSuppressed() || this.mode === 'idle') return
      void this.handleInvoluntaryDismount()
    })

    this.monitorTimer = setInterval(() => {
      void this.checkMountedState()
    }, this.checkIntervalMs)
  }

  stop (): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer)
      this.monitorTimer = null
    }
    this.listenersAttached = false
    this.clearMode()
  }

  private isPhysicallyMounted (bot: Bot): boolean {
    if (this.mode === 'player' && this.targetPlayer) {
      return isMountedOnPlayer(bot, this.targetPlayer)
    }
    if (this.mode === 'minecart') {
      return isMountedOnMinecart(bot)
    }
    return false
  }

  private async onDismountEvent (): Promise<void> {
    // 主动下马过程中由 dismount() 负责收尾，不要触发重骑
    if (this.isRemountSuppressed() || !this.isActive()) {
      return
    }
    await sleep(200)
    if (this.isRemountSuppressed() || !this.isActive()) return
    await this.handleInvoluntaryDismount()
  }

  private async checkMountedState (): Promise<void> {
    const bot = this.mcBot.bot
    if (!bot || this.mode === 'idle' || this.handlingDismount) return
    if (this.isRemountSuppressed()) return

    if (this.isPhysicallyMounted(bot)) {
      this.notMountedStreak = 0
      return
    }

    this.notMountedStreak++
    if (this.notMountedStreak < 2) return

    this.notMountedStreak = 0
    clearVehicleState(bot)
    await this.handleInvoluntaryDismount()
  }

  private async handleInvoluntaryDismount (): Promise<void> {
    if (this.handlingDismount || this.mode === 'idle') return
    if (this.isRemountSuppressed()) return
    this.handlingDismount = true

    try {
      const bot = this.mcBot.bot
      if (bot) {
        clearVehicleState(bot)
        // 服务器解除骑乘后常停在半空，主动落地后再决定重骑/回家
        await settleOnGround(bot)
      }

      if (this.isRemountSuppressed()) return

      // 锁定期间不重骑、不回家，仅退出骑乘模式并 AFK
      if (this.isLocked()) {
        console.log('[Riding] 已锁定，跳过重骑/回家')
        this.clearMode()
        this.onBehaviorEnd?.()
        return
      }

      if (this.mode === 'player' && this.targetPlayer) {
        // 已知已脱离：落地后即使贴脸也不要当成“还在骑”，直接尝试重骑
        await this.handlePlayerRemount(this.targetPlayer, true)
        return
      }

      if (this.mode === 'minecart') {
        this.clearMode()
        this.onBehaviorEnd?.()
      }
    } finally {
      this.handlingDismount = false
    }
  }

  private async handlePlayerRemount (targetName: string, force = false): Promise<void> {
    const bot = this.mcBot.bot
    if (!bot) {
      this.clearMode()
      return
    }

    if (this.isRemountSuppressed()) return

    if (this.isLocked()) {
      console.log('[Riding] 已锁定，跳过重骑/回家')
      this.clearMode()
      this.onBehaviorEnd?.()
      return
    }

    if (!force && isMountedOnPlayer(bot, targetName)) {
      this.notMountedStreak = 0
      return
    }

    console.log(`[Riding] 已脱离 ${targetName}，尝试重新骑乘`)

    if (!this.playerInteraction.isPlayerInRange(targetName)) {
      console.log(`[Riding] ${targetName} 超出寻路范围，执行 ${this.homeCommand}`)
      this.mcBot.chat(this.homeCommand)
      this.clearMode()
      this.onBehaviorEnd?.()
      return
    }

    const remounted = await this.playerInteraction.remountPlayer(targetName)
    if (this.isRemountSuppressed()) return

    if (remounted) {
      console.log(`[Riding] 重新骑乘 ${targetName} 成功`)
      this.notMountedStreak = 0
      return
    }

    console.log(`[Riding] 重新骑乘失败，执行 ${this.homeCommand}`)
    this.mcBot.chat(this.homeCommand)
    this.clearMode()
    this.onBehaviorEnd?.()
  }
}
