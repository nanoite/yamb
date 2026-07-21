import { componentToText, usernameFromUuid } from '../../platform/chat-utils'
import { getBotClient } from '../../platform/bot-client'
import { parseWhisperMessage, shouldIgnoreSystemMessage } from './whisper-parser'
import MessageDeduper from './message-deduper'
import type { CommandSource } from './parser'
import type MinecraftBot from '../../platform/minecraft-bot'
import type CommandHandler from './handler'
import type TeleportIncomingHandler from '../teleport/incoming-handler'
import type SystemMessageBuffer from './system-buffer'

type BotWithFlag = NonNullable<MinecraftBot['bot']> & { _mchatbotListenersRegistered?: boolean }

export function registerChatListeners (
  mcBot: MinecraftBot,
  commandHandler?: CommandHandler,
  teleportHandler?: TeleportIncomingHandler,
  systemBuffer?: SystemMessageBuffer
): void {
  const bot = mcBot.bot as BotWithFlag | null
  if (!bot) return
  if (bot._mchatbotListenersRegistered) return
  bot._mchatbotListenersRegistered = true

  const deduper = new MessageDeduper()

  function dispatch (username: string, message: string, source: CommandSource): void {
    const text = message.trim()
    if (!text || !username || deduper.shouldSkip(username, text)) return

    console.log(`[MC:${source}] ${username}: ${text}`)
    teleportHandler?.handle(text)
    if (commandHandler) {
      void commandHandler.handle(username, text, source)
    }
  }

  function handleSystemText (text: string): void {
    const trimmed = text.trim()
    if (!trimmed || deduper.shouldSkipSystem(trimmed)) return

    if (shouldIgnoreSystemMessage(trimmed)) return

    systemBuffer?.push(trimmed)
    teleportHandler?.handle(trimmed)

    const chatMatch = trimmed.match(/^『[^』]*』(.+?)\s*>\s*(.+)$/)
    if (chatMatch) {
      dispatch(chatMatch[1].trim(), chatMatch[2].trim(), 'chat')
      return
    }

    const whisper = parseWhisperMessage(trimmed)
    if (whisper) {
      dispatch(whisper.username, whisper.message, 'whisper')
      return
    }

    console.log(`[MC:system] ${trimmed}`)
  }

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    dispatch(username, message, 'chat')
  })

  bot.on('whisper', (username, message) => {
    if (username === bot.username) return
    dispatch(username, message, 'whisper')
  })

  getBotClient(bot)?.on('system_chat', (packet: unknown) => {
    try {
      const content = (packet as { content?: unknown }).content
      const message = componentToText(content as Parameters<typeof componentToText>[0])
      if (message) handleSystemText(message)
    } catch (error) {
      console.error('[Command] system_chat 处理失败:', error)
    }
  })

  bot.on('messagestr', (message, position) => {
    const text = String(message || '').trim()
    if (!text || position === 'chat') return
    handleSystemText(text)
  })

  getBotClient(bot)?.on('player_chat', (packet: unknown) => {
    const p = packet as Record<string, unknown>
    try {
      let message = ''
      let username: string | null = null

      if (p.senderUuid) {
        username = usernameFromUuid(bot, String(p.senderUuid))
      }
      if (!username && p.senderName) {
        username = componentToText(p.senderName as Parameters<typeof componentToText>[0])
      }

      if (p.plainMessage) {
        message = String(p.plainMessage)
      } else if (p.unsignedChatContent) {
        message = componentToText(p.unsignedChatContent as Parameters<typeof componentToText>[0])
      } else if (p.signedChatContent) {
        message = componentToText(p.signedChatContent as Parameters<typeof componentToText>[0])
      } else if (p.message) {
        message = componentToText(p.message as Parameters<typeof componentToText>[0])
      }

      if (username && message) {
        dispatch(username, message, 'chat')
      }
    } catch (error) {
      console.error('[Command] player_chat 处理失败:', error)
    }
  })

  bot.on('playerJoined', (player) => {
    if (player.username === bot.username) return
    if (deduper.shouldSkipEvent(`join:${player.username}`)) return
    console.log(`[MC:join] ${player.username} 加入了游戏`)
  })

  bot.on('playerLeft', (player) => {
    if (player.username === bot.username) return
    if (deduper.shouldSkipEvent(`leave:${player.username}`)) return
    console.log(`[MC:leave] ${player.username} 离开了游戏`)
  })

  bot.on('death', () => {
    console.log('[MC:death] 机器人死亡')
  })

  bot.on('respawn', () => {
    console.log('[MC:respawn] 机器人重生')
  })
}
