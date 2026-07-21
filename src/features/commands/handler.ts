import type { BotBehaviorConfig, CommandConfig } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import type GameApiService from '../../api/game-service'
import type TeleportService from '../teleport/service'
import type Whitelist from '../../permissions/whitelist'
import type StandbyManager from '../standby/manager'
import type PlayerInteractionService from '../../actions/player'
import type MinecartInteractionService from '../../actions/minecart'
import type RidingManager from '../riding/manager'
import type ContainerRegistry from '../container/registry'
import type InventoryActions from '../../actions/inventory'
import type SystemMessageBuffer from './system-buffer'
import CommandMessages from './messages'
import { sleep } from '../../platform/sleep'
import { getTargetContainerBlock } from '../container/utils'
import {
  type CommandSource,
  matchesPrefix,
  normalizeInput,
  parsePrefixedArgs,
  parseWhisperCommand
} from './parser'

export default class CommandHandler {
  private mcBot: MinecraftBot
  private teleportService: TeleportService
  private gameApiService: GameApiService
  private playerInteraction: PlayerInteractionService
  private minecartInteraction: MinecartInteractionService
  private ridingManager: RidingManager
  private containerRegistry: ContainerRegistry
  private inventoryActions: InventoryActions
  private systemBuffer: SystemMessageBuffer
  private whitelist: Whitelist
  private standby: StandbyManager
  private messages: CommandMessages
  private prefix: string
  private adminList: Set<string>
  private allowPublicCommands: boolean
  private replyAlwaysWhisper: boolean
  private replyDelayMs: number
  private forwardWaitMs: number
  private interactionDistance: number
  private approachDistance: number
  private _lastCmd?: { key: string; time: number }

  constructor (
    mcBot: MinecraftBot,
    teleportService: TeleportService,
    gameApiService: GameApiService,
    playerInteraction: PlayerInteractionService,
    minecartInteraction: MinecartInteractionService,
    ridingManager: RidingManager,
    containerRegistry: ContainerRegistry,
    inventoryActions: InventoryActions,
    systemBuffer: SystemMessageBuffer,
    whitelist: Whitelist,
    standby: StandbyManager,
    config: CommandConfig,
    botConfig: BotBehaviorConfig,
    adminList: string[]
  ) {
    this.mcBot = mcBot
    this.teleportService = teleportService
    this.gameApiService = gameApiService
    this.playerInteraction = playerInteraction
    this.minecartInteraction = minecartInteraction
    this.ridingManager = ridingManager
    this.containerRegistry = containerRegistry
    this.inventoryActions = inventoryActions
    this.systemBuffer = systemBuffer
    this.whitelist = whitelist
    this.standby = standby
    this.prefix = config.prefix || '#ybot'
    this.messages = new CommandMessages(config.messages, this.prefix)
    this.adminList = new Set(adminList)
    this.allowPublicCommands = config.allowPublicCommands
    this.replyAlwaysWhisper = config.replyAlwaysWhisper
    this.replyDelayMs = botConfig.replyDelayMs
    this.forwardWaitMs = botConfig.forwardWaitMs
    this.interactionDistance = botConfig.interactionDistance
    this.approachDistance = botConfig.approachDistance
  }

  getCommandMessages (): CommandMessages {
    return this.messages
  }

  isAdmin (username: string): boolean {
    return this.adminList.has(username)
  }

  isWhitelisted (username: string): boolean {
    return this.whitelist.isAllowed(username)
  }

  private useWhisperReply (source: CommandSource): boolean {
    return this.replyAlwaysWhisper || source === 'whisper'
  }

  async reply (username: string, message: string, source: CommandSource): Promise<void> {
    const lines = message.split('\n').filter(line => line.trim())
    const viaWhisper = this.useWhisperReply(source)

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await sleep(this.replyDelayMs)
      const line = lines[i]
      const ok = viaWhisper
        ? this.mcBot.whisper(username, line)
        : this.mcBot.chat(line)
      if (!ok) {
        console.warn(`[Command] 回复失败 -> ${username}: ${line}`)
      }
    }
  }

  private waypointHint (): string {
    const aliases = this.teleportService.listWaypointAliases()
    return aliases.length > 0 ? aliases.join(', ') : '无'
  }

  private async notifyLocked (username: string, source: CommandSource): Promise<void> {
    const lockedBy = this.teleportService.getLockedBy() || '未知'
    await this.reply(username, this.messages.text('lockedBlocked', { lockedBy }), source)
  }

  async handle (username: string, message: string, source: CommandSource): Promise<void> {
    if (username === this.mcBot.bot?.username) return

    const text = normalizeInput(message)
    if (!text) return
    if (!this.isWhitelisted(username)) return

    let parts: string[] | null = null

    if (source === 'whisper') {
      parts = parseWhisperCommand(text)
      if (!parts) return
    } else {
      if (!this.allowPublicCommands) return
      if (!matchesPrefix(text, this.prefix)) return
      const args = parsePrefixedArgs(text, this.prefix)
      if (args.length === 0) {
        await this.reply(username, this.messages.text('emptyCommand'), source)
        this.standby.scheduleAfk()
        return
      }
      parts = args
    }

    const dedupeKey = `${source}:${username}:${text}`
    const now = Date.now()
    if (this._lastCmd?.key === dedupeKey && now - this._lastCmd.time < 2000) return
    this._lastCmd = { key: dedupeKey, time: now }

    this.standby.touch()

    const cmd = (parts.shift() || '').toLowerCase()
    console.log(`[Command:${source}] ${username} -> ${cmd} ${parts.join(' ')}`.trim())

    switch (cmd) {
      case 'phome':
        await this._phome(username, parts[0], source)
        break
      case 'mount':
        await this._mount(username, parts[0], source)
        break
      case 'unmount':
        await this._unmount(username, source)
        break
      case 'cart':
        await this._cart(username, source)
        break
      case 'attack':
        await this._attack(username, parts[0], source)
        break
      case 'container':
        await this._container(username, parts, source)
        break
      case 'lock':
        await this._lock(username, source)
        break
      case 'unlock':
        await this._unlock(username, source)
        break
      case 'add':
        await this._add(username, parts[0], source)
        break
      case 'remove':
        await this._remove(username, parts[0], source)
        break
      case 'status':
        await this._status(username, source)
        break
      case 'inv':
        await this._inv(username, source)
        break
      case 'store':
        await this._store(username, parts, source)
        break
      case 'take':
        await this._take(username, parts, source)
        break
      case 'drop':
        await this._drop(username, parts, source)
        break
      case 'say':
        await this._say(username, parts.join(' '), source)
        break
      case 'forward':
        await this._forward(username, parts.join(' '), source)
        break
      case 'help':
      case '帮助':
        await this._help(username, source)
        break
      default:
        await this.reply(username, this.messages.text('unknownCommand', { cmd }), source)
    }

    this.standby.scheduleAfk()
  }

  private async _phome (username: string, alias: string | undefined, source: CommandSource): Promise<void> {
    if (!alias) {
      await this.reply(username, this.messages.text('phomeUsage', { waypoints: this.waypointHint() }), source)
      return
    }

    const result = await this.teleportService.goToPlayerViaWaypoint(username, alias)
    if (result.code === 'locked') {
      await this.notifyLocked(username, source)
      return
    }
    if (!result.success && result.message) {
      await this.reply(username, this.messages.text('phomeError', { message: result.message }), source)
    }
  }

  private async _mount (username: string, target: string | undefined, source: CommandSource): Promise<void> {
    const targetName = target?.trim() || username
    const currentTarget = this.ridingManager.getTargetPlayer()

    if (
      this.ridingManager.getMode() === 'player' &&
      currentTarget === targetName &&
      this.playerInteraction.isMountedOn(targetName)
    ) {
      await this.reply(username, this.messages.text('mountAlready', { target: targetName }), source)
      return
    }

    if (this.ridingManager.isActive()) {
      await this.ridingManager.dismount()
      await sleep(400)
    }

    const result = await this.playerInteraction.mount(targetName)
    if (result.success && this.playerInteraction.isMountedOn(targetName)) {
      this.ridingManager.enterPlayerMode(targetName)
    }
    await this.reply(username, result.success
      ? this.messages.text('mountSuccess', { message: result.message || '已骑乘' })
      : this.messages.text('mountError', { message: result.message || '骑乘失败' }), source)
  }

  private async _unmount (username: string, source: CommandSource): Promise<void> {
    const result = await this.ridingManager.dismount()
    await this.reply(username, result.success
      ? this.messages.text('unmountSuccess', { message: result.message })
      : this.messages.text('unmountError', { message: result.message }), source)
  }

  private async _cart (username: string, source: CommandSource): Promise<void> {
    const ridingTarget = this.ridingManager.getTargetPlayer()
    if (
      this.ridingManager.getMode() === 'player' &&
      ridingTarget &&
      !this.playerInteraction.isMountedOn(ridingTarget)
    ) {
      this.ridingManager.clearMode()
    }

    const result = await this.minecartInteraction.boardNearest()
    if (result.success) {
      this.ridingManager.enterMinecartMode()
    }
    await this.reply(username, result.success
      ? this.messages.text('cartSuccess', { message: result.message || '已上车' })
      : this.messages.text('cartError', { message: result.message || '上车失败' }), source)
  }

  private async _attack (username: string, target: string | undefined, source: CommandSource): Promise<void> {
    const targetName = target?.trim() || username
    const result = await this.playerInteraction.attack(targetName)
    await this.reply(username, result.success
      ? this.messages.text('attackSuccess', { message: result.message || '已攻击' })
      : this.messages.text('attackError', { message: result.message || '攻击失败' }), source)
  }

  private async _container (
    username: string,
    parts: string[],
    source: CommandSource
  ): Promise<void> {
    const sub = (parts.shift() || '').toLowerCase()
    switch (sub) {
      case 'add':
        await this._containerAdd(username, parts[0], source)
        break
      case 'remove':
        await this._containerRemove(username, parts[0], source)
        break
      case 'list':
        await this._containerList(username, source)
        break
      case 'info':
        await this._containerInfo(username, parts[0], source)
        break
      default:
        await this.reply(username, [
          this.messages.text('containerAddUsage'),
          this.messages.text('containerRemoveUsage'),
          this.messages.text('containerInfoUsage'),
          'container list — 列出容器'
        ].join('\n'), source)
    }
  }

  private async _containerAdd (username: string, alias: string | undefined, source: CommandSource): Promise<void> {
    if (!this.isAdmin(username)) {
      await this.reply(username, this.messages.text('noPermission'), source)
      return
    }
    if (!alias) {
      await this.reply(username, this.messages.text('containerAddUsage'), source)
      return
    }

    const bot = this.mcBot.bot
    if (!bot) {
      await this.reply(username, this.messages.text('containerNoTarget'), source)
      return
    }

    const target = getTargetContainerBlock(bot)
    if (!target) {
      await this.reply(username, this.messages.text('containerNoTarget'), source)
      return
    }

    const pos = target.block.position
    this.containerRegistry.add({
      alias,
      type: target.type,
      x: pos.x,
      y: pos.y,
      z: pos.z,
      dimension: bot.game?.dimension || 'overworld',
      addedBy: username
    })

    await this.reply(username, this.messages.text('containerAddSuccess', {
      alias,
      type: target.type,
      x: pos.x,
      y: pos.y,
      z: pos.z
    }), source)
  }

  private async _containerRemove (username: string, alias: string | undefined, source: CommandSource): Promise<void> {
    if (!this.isAdmin(username)) {
      await this.reply(username, this.messages.text('noPermission'), source)
      return
    }
    if (!alias) {
      await this.reply(username, this.messages.text('containerRemoveUsage'), source)
      return
    }
    if (!this.containerRegistry.remove(alias)) {
      await this.reply(username, this.messages.text('containerRemoveNotFound', { alias }), source)
      return
    }
    await this.reply(username, this.messages.text('containerRemoveSuccess', { alias }), source)
  }

  private async _containerList (username: string, source: CommandSource): Promise<void> {
    const list = this.containerRegistry.list()
    if (list.length === 0) {
      await this.reply(username, this.messages.text('containerListEmpty'), source)
      return
    }

    const lines = [
      this.messages.text('containerListHeader', { count: list.length }),
      ...list.map(c => this.messages.text('containerListEntry', {
        alias: c.alias,
        type: c.type,
        x: c.x,
        y: c.y,
        z: c.z
      }))
    ]
    await this.reply(username, lines.join('\n'), source)
  }

  private async _containerInfo (username: string, alias: string | undefined, source: CommandSource): Promise<void> {
    if (!alias) {
      await this.reply(username, this.messages.text('containerInfoUsage'), source)
      return
    }
    const info = this.containerRegistry.get(alias)
    if (!info) {
      await this.reply(username, this.messages.text('containerInfoNotFound', { alias }), source)
      return
    }
    const lines = this.messages.lines('containerInfoLines', {
      alias: info.alias,
      type: info.type,
      x: info.x,
      y: info.y,
      z: info.z,
      dimension: info.dimension,
      addedBy: info.addedBy,
      date: info.addedAt.slice(0, 10)
    })
    await this.reply(username, lines.join('\n'), source)
  }

  private async _lock (username: string, source: CommandSource): Promise<void> {
    if (this.teleportService.isLocked()) {
      await this.reply(username, this.messages.text('lockAlready'), source)
      return
    }
    this.teleportService.lock(username)
    await this.reply(username, this.messages.text('lockSuccess'), source)
  }

  private async _unlock (username: string, source: CommandSource): Promise<void> {
    if (!this.teleportService.isLocked()) {
      await this.reply(username, this.messages.text('unlockNotLocked'), source)
      return
    }
    this.teleportService.unlock()
    await this.reply(username, this.messages.text('unlockSuccess'), source)
  }

  private async _add (username: string, gameName: string | undefined, source: CommandSource): Promise<void> {
    if (!this.isAdmin(username)) {
      await this.reply(username, this.messages.text('noPermission'), source)
      return
    }
    if (!gameName) {
      await this.reply(username, this.messages.text('addUsage'), source)
      return
    }
    if (this.whitelist.isAllowed(gameName)) {
      await this.reply(username, this.messages.text('addAlready', { gameName }), source)
      return
    }

    this.whitelist.add(gameName, username)
    await this.reply(username, this.messages.text('addSuccess', { gameName }), source)
  }

  private async _remove (username: string, gameName: string | undefined, source: CommandSource): Promise<void> {
    if (!this.isAdmin(username)) {
      await this.reply(username, this.messages.text('noPermission'), source)
      return
    }
    if (!gameName) {
      await this.reply(username, this.messages.text('removeUsage'), source)
      return
    }
    if (!this.whitelist.isAllowed(gameName)) {
      await this.reply(username, this.messages.text('removeNotFound', { gameName }), source)
      return
    }

    this.whitelist.remove(gameName)
    await this.reply(username, this.messages.text('removeSuccess', { gameName }), source)
  }

  private resolveActivityStatus (): string {
    if (this.teleportService.isLocked()) return '锁定'
    const mode = this.ridingManager.getMode()
    if (mode === 'player') return '骑乘'
    if (mode === 'minecart') return '矿车'
    return '空闲'
  }

  private formatPosition (): string {
    const bot = this.mcBot.bot
    if (!bot) return '未知'
    const p = bot.entity.position
    return `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`
  }

  private async _status (username: string, source: CommandSource): Promise<void> {
    const uptimeSec = Math.floor(process.uptime())
    const hours = Math.floor(uptimeSec / 3600)
    const minutes = Math.floor((uptimeSec % 3600) / 60)

    const lines = [
      `状态: ${this.resolveActivityStatus()}`,
      `运行: ${hours}h ${minutes}m`,
      `位置: ${this.formatPosition()}`
    ]
    await this.reply(username, lines.join('\n'), source)
  }

  private async _inv (username: string, source: CommandSource): Promise<void> {
    if (!this.isAdmin(username)) {
      await this.reply(username, this.messages.text('noPermission'), source)
      return
    }

    const result = this.inventoryActions.listInventory()
    if (!result.success) {
      await this.reply(username, this.messages.text('invError', { message: result.message || '失败' }), source)
      return
    }

    if (!result.lines?.length) {
      await this.reply(username, this.messages.text('invEmpty'), source)
      return
    }

    const header = this.messages.text('invHeader', { count: result.lines.length })
    await this.reply(username, [header, ...result.lines].join('\n'), source)
  }

  private async _store (username: string, parts: string[], source: CommandSource): Promise<void> {
    const alias = parts[0]
    const itemQuery = parts[1]
    const count = parts[2] ? parseInt(parts[2], 10) : undefined

    if (!alias || !itemQuery) {
      await this.reply(username, this.messages.text('storeUsage'), source)
      return
    }

    const record = this.containerRegistry.get(alias)
    if (!record) {
      await this.reply(username, this.messages.text('containerInfoNotFound', { alias }), source)
      return
    }

    const result = await this.inventoryActions.storeInContainer(
      record.x,
      record.y,
      record.z,
      itemQuery,
      Number.isFinite(count) ? count : undefined,
      this.interactionDistance,
      this.approachDistance
    )
    await this.reply(username, result.success
      ? this.messages.text('storeSuccess', { message: result.message || '已存入' })
      : this.messages.text('storeError', { message: result.message || '存入失败' }), source)
  }

  private async _take (username: string, parts: string[], source: CommandSource): Promise<void> {
    const alias = parts[0]
    const itemQuery = parts[1]
    const count = parts[2] ? parseInt(parts[2], 10) : undefined

    if (!alias || !itemQuery) {
      await this.reply(username, this.messages.text('takeUsage'), source)
      return
    }

    const record = this.containerRegistry.get(alias)
    if (!record) {
      await this.reply(username, this.messages.text('containerInfoNotFound', { alias }), source)
      return
    }

    const result = await this.inventoryActions.takeFromContainer(
      record.x,
      record.y,
      record.z,
      itemQuery,
      Number.isFinite(count) ? count : undefined,
      this.interactionDistance,
      this.approachDistance
    )
    await this.reply(username, result.success
      ? this.messages.text('takeSuccess', { message: result.message || '已取出' })
      : this.messages.text('takeError', { message: result.message || '取出失败' }), source)
  }

  private async _drop (username: string, parts: string[], source: CommandSource): Promise<void> {
    const itemQuery = parts[0]
    const count = parts[1] ? parseInt(parts[1], 10) : undefined

    if (!itemQuery) {
      await this.reply(username, this.messages.text('dropUsage'), source)
      return
    }

    const result = await this.inventoryActions.dropItem(
      itemQuery,
      Number.isFinite(count) ? count : undefined
    )
    await this.reply(username, result.success
      ? this.messages.text('dropSuccess', { message: result.message || '已丢弃' })
      : this.messages.text('dropError', { message: result.message || '丢弃失败' }), source)
  }

  private async _say (username: string, message: string, source: CommandSource): Promise<void> {
    if (!this.isAdmin(username)) {
      await this.reply(username, this.messages.text('noPermission'), source)
      return
    }
    if (!message) {
      await this.reply(username, this.messages.text('sayUsage'), source)
      return
    }

    const result = this.gameApiService.say(message)
    await this.reply(username, result.success
      ? this.messages.text('saySuccess')
      : this.messages.text('sayError', { message: result.message || '发送失败' }), source)
  }

  private async _forward (username: string, message: string, source: CommandSource): Promise<void> {
    if (!this.isAdmin(username)) {
      await this.reply(username, this.messages.text('noPermission'), source)
      return
    }
    if (!message) {
      await this.reply(username, this.messages.text('forwardUsage'), source)
      return
    }

    const sentAt = Date.now()
    const result = this.gameApiService.say(message)
    if (!result.success) {
      await this.reply(username, this.messages.text('forwardError', { message: result.message || '发送失败' }), source)
      return
    }

    await sleep(this.forwardWaitMs)
    const systemLines = this.systemBuffer.collect(sentAt, this.forwardWaitMs)

    if (systemLines.length === 0) {
      await this.reply(username, this.messages.text('forwardEmpty'), source)
      return
    }

    await this.reply(username, systemLines.join('\n'), source)
  }

  private async _help (username: string, source: CommandSource): Promise<void> {
    const lines = this.messages.lines('helpLines', { waypoints: this.waypointHint() })
    await this.reply(username, lines.join('\n'), source)
  }
}
