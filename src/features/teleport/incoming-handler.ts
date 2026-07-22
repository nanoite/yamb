import type MinecraftBot from '../../platform/minecraft-bot'
import type Whitelist from '../../permissions/whitelist'
import type TeleportService from './service'
import type CommandMessages from '../commands/messages'
import type StandbyManager from '../standby/manager'
import { parseIncomingTeleportRequest } from './tpa-parser'

export default class TeleportIncomingHandler {
  private teleportService: TeleportService
  private whitelist: Whitelist
  private mcBot: MinecraftBot
  private messages: CommandMessages
  private standby: StandbyManager
  private _lastAccept?: { key: string; time: number }
  private _lastLockNotify?: { key: string; time: number }

  constructor (
    teleportService: TeleportService,
    whitelist: Whitelist,
    mcBot: MinecraftBot,
    messages: CommandMessages,
    standby: StandbyManager
  ) {
    this.teleportService = teleportService
    this.whitelist = whitelist
    this.mcBot = mcBot
    this.messages = messages
    this.standby = standby
  }

  handle (text: string): boolean {
    const request = parseIncomingTeleportRequest(text)
    if (!request) return false

    if (!this.whitelist.isAllowed(request.playerName)) return false

    this.standby.touch()

    if (!this.teleportService.canAcceptRequest(request.type)) {
      if (request.type === 'tpahere' && this.teleportService.isLocked()) {
        this.notifyLocked(request.playerName)
      }
      this.standby.scheduleAfk()
      return true
    }

    const dedupeKey = `${request.type}:${request.playerName}`
    const now = Date.now()
    if (this._lastAccept?.key === dedupeKey && now - this._lastAccept.time < 3000) {
      return true
    }
    this._lastAccept = { key: dedupeKey, time: now }

    void this.teleportService.acceptRequest(request.playerName, request.type).then(() => {
      this.standby.scheduleAfk()
    })
    return true
  }

  private notifyLocked (playerName: string): void {
    const lockedBy = this.teleportService.getLockedBy() || '未知'
    const dedupeKey = `lock:${playerName}:${lockedBy}`
    const now = Date.now()
    if (this._lastLockNotify?.key === dedupeKey && now - this._lastLockNotify.time < 5000) {
      return
    }
    this._lastLockNotify = { key: dedupeKey, time: now }

    const message = this.messages.text('lockedBlocked', { lockedBy })
    this.mcBot.whisper(playerName, message)
    console.log(`[Teleport] 锁定拒绝 -> 通知 ${playerName} (锁定者: ${lockedBy})`)
  }
}
