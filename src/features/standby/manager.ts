import type { BotBehaviorConfig } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import { eatGoldenCarrotsUntilFull } from './food'
import { sleep } from '../../platform/sleep'

import type RidingManager from '../riding/manager'

export default class StandbyManager {
  private mcBot: MinecraftBot
  private ridingManager: RidingManager | null = null
  private idleTimeoutMs: number
  private homeCommand: string
  private afkCommand: string
  private afkDelayMs: number
  private homeWaitMs: number
  private checkIntervalMs: number
  private lastActivity = Date.now()
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private afkTimer: ReturnType<typeof setTimeout> | null = null
  private goingHome = false

  constructor (mcBot: MinecraftBot, config: BotBehaviorConfig) {
    this.mcBot = mcBot
    this.idleTimeoutMs = config.idleTimeoutMs
    this.homeCommand = config.homeCommand
    this.afkCommand = config.afkCommand
    this.afkDelayMs = config.afkDelayMs
    this.homeWaitMs = config.homeWaitMs
    this.checkIntervalMs = config.idleCheckIntervalMs
  }

  setRidingManager (ridingManager: RidingManager): void {
    this.ridingManager = ridingManager
  }

  start (): void {
    if (this.checkTimer) return
    this.touch()
    this.checkTimer = setInterval(() => {
      void this.checkIdle()
    }, this.checkIntervalMs)
    console.log(`[Standby] 空闲 ${this.idleTimeoutMs / 1000}s 后自动回家`)
  }

  stop (): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
    if (this.afkTimer) {
      clearTimeout(this.afkTimer)
      this.afkTimer = null
    }
  }

  touch (): void {
    this.lastActivity = Date.now()
  }

  scheduleAfk (): void {
    if (this.afkTimer) clearTimeout(this.afkTimer)
    this.afkTimer = setTimeout(() => {
      if (this.mcBot.chat(this.afkCommand)) {
        console.log(`[Standby] 执行 ${this.afkCommand}`)
      }
    }, this.afkDelayMs)
  }

  private async checkIdle (): Promise<void> {
    if (!this.mcBot.isReady || this.goingHome) return
    if (this.ridingManager?.isActive()) return
    if (Date.now() - this.lastActivity < this.idleTimeoutMs) return
    await this.goHomeStandby()
  }

  async goHomeStandby (): Promise<void> {
    if (!this.mcBot.isReady || !this.mcBot.bot || this.goingHome) return

    this.goingHome = true
    console.log(`[Standby] 超过 ${this.idleTimeoutMs / 1000}s 无互动，执行 ${this.homeCommand}`)

    try {
      this.mcBot.chat(this.homeCommand)
      await sleep(this.homeWaitMs)

      if (this.mcBot.bot) {
        await eatGoldenCarrotsUntilFull(this.mcBot.bot)
      }

      this.scheduleAfk()
      this.touch()
    } catch (err) {
      console.error('[Standby] 回家待命失败:', (err as Error).message)
    } finally {
      this.goingHome = false
    }
  }
}
