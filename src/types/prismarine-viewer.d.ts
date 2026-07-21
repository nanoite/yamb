declare module 'prismarine-viewer' {
  import type { Bot } from 'mineflayer'

  export interface MineflayerViewerOptions {
    port?: number
    firstPerson?: boolean
    viewDistance?: number
  }

  export function mineflayer (bot: Bot, options?: MineflayerViewerOptions): void
}
