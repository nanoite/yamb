import type { Bot } from 'mineflayer'
import type { BotBehaviorConfig } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import type PlayerInteractionService from '../../actions/player'
import {
  clearVehicleState,
  isMountedOnMinecart,
  isMountedOnPlayer,
  performDismount
} from '../../actions/shared/entity-utils'
import { sleep } from '../../platform/sleep'

export type RidingMode = 'idle' | 'player' | 'minecart'

type Entity = NonNullable<Bot['entities'][string]>

export default class RidingManager {
  private mcBot: MinecraftBot
  private playerInteraction: PlayerInteractionService
  private homeCommand: string
  private checkIntervalMs: number
  private mode: RidingMode = 'idle'
  private targetPlayer: string | null = null
  private dismountRequested = false
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
    this.mode = 'player'
    this.targetPlayer = playerName
    this.dismountRequested = false
    this.notMountedStreak = 0
    console.log(`[Riding] 进入骑乘模式 -> ${playerName}`)
  }

  enterMinecartMode (): void {
    this.mode = 'minecart'
    this.targetPlayer = null
    this.dismountRequested = false
    this.notMountedStreak = 0
    console.log('[Riding] 进入矿车模式')
  }

  clearMode (): void {
    if (this.mode === 'idle') return
    console.log(`[Riding] 退出 ${this.mode} 模式`)
    this.mode = 'idle'
    this.targetPlayer = null
    this.dismountRequested = false
    this.handlingDismount = false
    this.notMountedStreak = 0
    const bot = this.mcBot.bot
    if (bot) clearVehicleState(bot)
  }

  async dismount (): Promise<{ success: boolean; message: string }> {
    const bot = this.mcBot.bot
    if (!bot || this.mode === 'idle') {
      return { success: false, message: '当前未处于骑乘状态' }
    }

    this.dismountRequested = true
    const ok = await performDismount(bot)
    this.clearMode()

    if (ok || !this.isPhysicallyMounted(bot)) {
      return { success: true, message: '已下马' }
    }
    return { success: false, message: '下马失败，请重试' }
  }

  start (): void {
    const bot = this.mcBot.bot
    if (!bot || this.listenersAttached) return
    this.listenersAttached = true

    bot.on('dismount', () => {
      void this.onDismountEvent()
    })

    bot.on('mount', () => {
      this.dismountRequested = false
      this.notMountedStreak = 0
    })

    bot.on('entityAttach', (entity: Entity, vehicle: Entity) => {
      if (entity !== bot.entity) return
      this.dismountRequested = false
      this.notMountedStreak = 0
      console.log(`[Riding] entityAttach -> ${vehicle.name || vehicle.username || vehicle.id}`)
    })

    bot.on('entityDetach', (entity: Entity) => {
      if (entity !== bot.entity || this.dismountRequested || this.mode === 'idle') return
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
    if (this.dismountRequested || this.mode === 'idle') {
      this.dismountRequested = false
      return
    }
    await sleep(200)
    await this.handleInvoluntaryDismount()
  }

  private async checkMountedState (): Promise<void> {
    const bot = this.mcBot.bot
    if (!bot || this.mode === 'idle' || this.handlingDismount) return
    if (this.dismountRequested) return

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
    this.handlingDismount = true

    try {
      if (this.mode === 'player' && this.targetPlayer) {
        await this.handlePlayerRemount(this.targetPlayer)
        return
      }

      if (this.mode === 'minecart') {
        this.clearMode()
      }
    } finally {
      this.handlingDismount = false
    }
  }

  private async handlePlayerRemount (targetName: string): Promise<void> {
    const bot = this.mcBot.bot
    if (!bot) {
      this.clearMode()
      return
    }

    if (isMountedOnPlayer(bot, targetName)) {
      this.notMountedStreak = 0
      return
    }

    console.log(`[Riding] 已脱离 ${targetName}，尝试重新骑乘`)

    if (!this.playerInteraction.isPlayerInRange(targetName)) {
      console.log(`[Riding] ${targetName} 超出寻路范围，执行 ${this.homeCommand}`)
      this.mcBot.chat(this.homeCommand)
      this.clearMode()
      return
    }

    const remounted = await this.playerInteraction.remountPlayer(targetName)
    if (remounted) {
      console.log(`[Riding] 重新骑乘 ${targetName} 成功`)
      this.notMountedStreak = 0
      return
    }

    console.log(`[Riding] 重新骑乘失败，执行 ${this.homeCommand}`)
    this.mcBot.chat(this.homeCommand)
    this.clearMode()
  }
}
