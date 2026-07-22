import mineflayer, { Bot, BotOptions } from 'mineflayer'
import type { MinecraftConfig } from '../types'
import type MessageQueue from './message-queue'
import { getBotClient } from './bot-client'
import { resumeBotPhysics } from '../actions/shared/entity-utils'

export default class MinecraftBot {
  config: MinecraftConfig
  bot: Bot | null = null
  isReady = false
  private acceptedResourcePacks = new Set<string>()
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 10
  private readonly reconnectDelay = 5000
  private messageQueue: MessageQueue | null = null
  private onSpawnCallbacks: Array<(bot: MinecraftBot) => void> = []
  private whisperCommand = '/msg'

  constructor (config: MinecraftConfig, whisperCommand = '/msg') {
    this.config = config
    this.whisperCommand = whisperCommand
  }

  setMessageQueue (queue: MessageQueue): void {
    this.messageQueue = queue
  }

  onSpawn (callback: (bot: MinecraftBot) => void): void {
    this.onSpawnCallbacks.push(callback)
  }

  create (): Bot {
    console.log('[MC] Creating bot...')
    const options = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username!,
      auth: this.config.auth as 'microsoft' | 'mojang' | 'offline',
      profilesFolder: this.config.profilesFolder,
      checkTimeoutInterval: this.config.checkTimeoutInterval || 300000,
      connectTimeout: 60000,
      keepAlive: true,
      skipValidation: true,
      hideErrors: true,
      physicsEnabled: true,
      ...(this.config.version !== false ? { version: this.config.version } : {})
    } as BotOptions

    // 微软账号走 OAuth，不能传 password
    if (this.config.auth !== 'microsoft' && this.config.password) {
      options.password = this.config.password
    }

    if (this.config.auth === 'microsoft') {
      console.log('[MC] 使用微软账号登录，首次运行需在终端完成浏览器授权')
    }

    this.bot = mineflayer.createBot(options)

    this._setupEvents()
    return this.bot
  }

  private _setupEvents (): void {
    if (!this.bot) return
    this._suppressProtocolErrors()

    this.bot.on('login', () => {
      console.log(`[MC] Logged in as ${this.bot!.username}`)
    })

    this.bot.on('spawn', () => {
      console.log('[MC] Bot spawned in world')
      this.isReady = true
      this.reconnectAttempts = 0
      this.bot!.physicsEnabled = true

      if (this.messageQueue) {
        this.messageQueue.setBot(this)
      }

      for (const callback of this.onSpawnCallbacks) {
        callback(this)
      }
    })

    // mount 会暂停物理；dismount 后 mineflayer 不会自动恢复，需手动打开
    this.bot.on('dismount', () => {
      console.log('[MC] dismount → 恢复物理')
      resumeBotPhysics(this.bot!)
    })

    this.bot.on('mount', () => {
      console.log('[MC] mount → 物理由 mineflayer 暂停（载具模式）')
    })

    this.bot.on('kicked', (reason) => {
      const reasonStr = typeof reason === 'string' ? reason : JSON.stringify(reason)
      console.log('[MC] Kicked:', reasonStr)
      this.isReady = false
    })

    this.bot.on('error', (err: NodeJS.ErrnoException) => {
      if (err.message && (err.message.includes('PartialReadError') ||
          err.message.includes('Read error') ||
          err.message.includes('resource_pack') ||
          err.message.includes('UUID') ||
          err.message.includes('configuration'))) {
        return
      }
      console.error('[MC] Error:', err.message)

      if (err.message.includes('fetch failed') || err.message.includes('Sign in failed')) {
        console.error('[MC] 登录失败提示:')
        console.error('  - 微软账号 (MC_AUTH=microsoft) 不需要填写 MC_PASSWORD')
        console.error('  - 删除 mc-tokens 目录后重新运行，在终端按提示完成浏览器授权')
        console.error('  - 若仍失败，检查网络是否能访问 Microsoft 登录服务')
      }

      if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') {
        this._handleReconnect('连接错误')
      }
    })

    this.bot.on('resourcePack', (url, hash) => {
      this._handleResourcePack(url, hash ?? '')
    })

    getBotClient(this.bot)?.on('add_resource_pack', (data: unknown) => {
      console.log('[MC] add_resource_pack received')
      this._acceptResourcePackOnce(String((data as { uuid?: string }).uuid || ''))
    })

    getBotClient(this.bot)?.on('resource_pack_send', (data: unknown) => {
      console.log('[MC] resource_pack_send received')
      this._acceptResourcePackOnce(String((data as { uuid?: string }).uuid || ''))
    })

    this.bot.on('end', (reason) => {
      console.log('[MC] Disconnected:', reason)
      this.isReady = false
      this._handleReconnect('连接断开')
    })
  }

  private _suppressProtocolErrors (): void {
    if (!this.bot) return
    const client = getBotClient(this.bot)
    if (!client) return

    client.on('error', (err: Error) => {
      if (err?.message) {
        const msg = err.message
        if (msg.includes('PartialReadError') ||
            msg.includes('Read error') ||
            msg.includes('protocol') ||
            msg.includes('decoder') ||
            msg.includes('parser') ||
            msg.includes('f32') ||
            msg.includes('intArray')) {
          return
        }
      }
    })

    if (client.socket) {
      client.socket.on('error', (err: NodeJS.ErrnoException) => {
        if (err?.message) {
          const msg = err.message
          if (msg.includes('PartialReadError') ||
              msg.includes('read') ||
              msg.includes('ECONNRESET') ||
              msg.includes('EPIPE')) {
            return
          }
        }
      })
    }

    const originalEmit = client.emit.bind(client)
    client.emit = function (event: string, ...args: unknown[]) {
      if (event === 'error') {
        const err = args[0] as Error
        if (err?.message &&
            (err.message.includes('PartialReadError') ||
             err.message.includes('Read error') ||
             err.message.includes('f32'))) {
          return false
        }
      }
      return originalEmit(event, ...args)
    }
  }

  private _handleResourcePack (url: string, hash: { ascii?: string } | string): void {
    if (!this.bot) return
    console.log('[MC] Resource pack received')
    const hashObj = typeof hash === 'object' ? hash : { ascii: String(hash) }
    const packKey = String(hashObj?.ascii || hash || url || '')

    if (packKey && this.acceptedResourcePacks.has(packKey)) {
      console.log('[MC] Resource pack already accepted')
      return
    }

    try {
      const uuidStr = hashObj?.ascii ? hashObj.ascii : String(hash || '')
      console.log('[MC] Pack UUID:', uuidStr)

      const statuses: Array<[string, number]> = [
        ['ACCEPTED', 3],
        ['DOWNLOADED', 4],
        ['SUCCESSFULLY_LOADED', 0]
      ]

      const client = getBotClient(this.bot)
      if (!client) return
      for (const [label, result] of statuses) {
        try {
          client.write('resource_pack_receive', {
            uuid: uuidStr,
            result: result
          })
          console.log(`[MC] Resource pack ${label} sent`)
        } catch (err) {
          console.error(`[MC] Resource pack ${label} failed:`, (err as Error).message)
        }
      }

      if (packKey) {
        this.acceptedResourcePacks.add(packKey)
      }
      console.log('[MC] Resource pack response completed')
    } catch (err) {
      console.error('[MC] Resource pack error:', (err as Error).message)
    }
  }

  private _acceptResourcePackOnce (uuid: string): void {
    const key = String(uuid || '')
    if (key && this.acceptedResourcePacks.has(key)) {
      return
    }
    this._handleResourcePack('', uuid)
  }

  private _handleReconnect (reason: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`[MC] 已达到最大重连次数 (${this.maxReconnectAttempts})，停止重连`)
      return
    }

    this.reconnectAttempts++
    const delay = reason.includes('spam') ? 30000 : this.reconnectDelay
    console.log(`[MC] ${reason} - 第 ${this.reconnectAttempts}/${this.maxReconnectAttempts} 次重连，等待 ${delay / 1000} 秒...`)

    setTimeout(() => {
      console.log('[MC] Reconnecting...')
      this.create()
    }, delay)
  }

  chat (message: string): boolean {
    if (!this.isReady || !this.bot) return false
    this.bot.chat(message)
    return true
  }

  whisper (username: string, message: string): boolean {
    if (!this.isReady || !this.bot) return false
    this.bot.chat(`${this.whisperCommand} ${username} ${message}`)
    return true
  }
}
