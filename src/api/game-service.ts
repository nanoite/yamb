import type { PlayersResult, ServiceResult, StatusResult } from '../types'
import type MinecraftBot from '../platform/minecraft-bot'
import type Whitelist from '../permissions/whitelist'

export default class GameApiService {
  private mcBot: MinecraftBot
  private whitelist: Whitelist
  private isLocked: () => boolean

  constructor (mcBot: MinecraftBot, whitelist: Whitelist, isLocked: () => boolean = () => false) {
    this.mcBot = mcBot
    this.whitelist = whitelist
    this.isLocked = isLocked
  }

  say (message: string): ServiceResult {
    if (!this.mcBot.isReady) {
      return { success: false, message: '机器人未就绪' }
    }
    if (this.isLocked()) {
      return { success: false, message: 'bot 已锁定，无法发送公屏消息' }
    }

    this.mcBot.chat(message)
    console.log(`[Command] Sent chat: ${message}`)
    return { success: true, message: '已发送消息' }
  }

  getPlayers (): PlayersResult {
    if (!this.mcBot.isReady || !this.mcBot.bot) {
      return { success: false, message: '机器人未就绪' }
    }

    const players = Object.keys(this.mcBot.bot.players || {})
    return { success: true, players, count: players.length }
  }

  getStatus (): StatusResult {
    return {
      success: true,
      minecraft: this.mcBot.isReady,
      username: this.mcBot.bot?.username || null,
      uptime: process.uptime(),
      whitelist_count: this.whitelist.count()
    }
  }
}
