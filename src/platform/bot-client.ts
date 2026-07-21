import { Bot } from 'mineflayer'

export type BotClient = {
  on: (event: string, listener: (...args: any[]) => void) => void
  write: (name: string, data: unknown) => void
  emit: (event: string, ...args: unknown[]) => boolean
  socket?: { on: (event: string, listener: (...args: any[]) => void) => void }
}

export type BotWithClient = Bot & { _client?: BotClient }

export function getBotClient (bot: Bot): BotClient | undefined {
  return (bot as BotWithClient)._client
}
