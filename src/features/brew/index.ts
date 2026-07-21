import type { BrewConfig } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'

export default class BrewModule {
  private mcBot: MinecraftBot
  private config: BrewConfig

  constructor (mcBot: MinecraftBot, config: BrewConfig) {
    this.mcBot = mcBot
    this.config = config
  }

  register (): void {
    if (!this.config.enabled) {
      console.log('[Brew] Module disabled')
      return
    }
    console.log('[Brew] Module registered (placeholder)')
  }
}
