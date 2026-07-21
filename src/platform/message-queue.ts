import type { MessageQueueConfig, QueueStatus, QueueTask } from '../types'
import type MinecraftBot from './minecraft-bot'

export default class MessageQueue {
  private queue: QueueTask[] = []
  private isProcessing = false
  private lock = false
  private maxSize: number
  private delayMs: number
  private bot: MinecraftBot | null = null

  constructor (options: Partial<MessageQueueConfig> = {}) {
    this.maxSize = options.maxSize ?? 100
    this.delayMs = options.delayMs ?? 1000
  }

  setBot (bot: MinecraftBot): void {
    this.bot = bot
  }

  enqueue (message: string, sender: string | null = null): void {
    if (!message || !message.trim()) return

    if (this.queue.length >= this.maxSize) {
      console.warn(`[Queue] 队列已满 (${this.maxSize})，丢弃消息: ${message}`)
      return
    }

    if (this.queue.length > 0) {
      const last = this.queue[this.queue.length - 1]
      if (last.message === message.trim() && last.sender === sender) {
        return
      }
    }

    this.queue.push({
      message: message.trim(),
      sender: sender || null,
      timestamp: Date.now()
    })

    if (!this.isProcessing && !this.lock) {
      this.process()
    }
  }

  process (): void {
    if (this.lock || this.isProcessing || this.queue.length === 0) return

    this.lock = true
    this.isProcessing = true

    const task = this.queue.shift()
    if (!task) {
      this.isProcessing = false
      this.lock = false
      return
    }

    setTimeout(() => {
      try {
        if (this.bot?.chat) {
          this.bot.chat(task.message)
          console.log(`[Queue] 发送消息: ${task.message} (来自: ${task.sender || '系统'})`)
        } else {
          console.warn('[Queue] Bot未就绪，消息丢弃:', task.message)
        }
      } catch (error) {
        console.error('[Queue] 发送消息失败:', error)
      }

      this.isProcessing = false
      this.lock = false

      if (this.queue.length > 0) {
        this.process()
      }
    }, this.delayMs)
  }

  clear (): void {
    this.queue = []
    console.log('[Queue] 队列已清空')
  }

  getStatus (): QueueStatus {
    return {
      size: this.queue.length,
      isProcessing: this.isProcessing,
      isLocked: this.lock,
      maxSize: this.maxSize
    }
  }
}
