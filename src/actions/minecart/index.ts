import type { Bot } from 'mineflayer'
import type { ServiceResult } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import { sleep } from '../../platform/sleep'
import {
  approachEntity,
  entityDistance,
  entityLookPoint,
  findNearestEntity,
  isMinecartEntity,
  isMountedOnMinecart
} from '../shared/entity-utils'

type Entity = NonNullable<Bot['entities'][string]>

export default class MinecartInteractionService {
  private mcBot: MinecraftBot
  private interactionDistance: number
  private approachDistance: number

  constructor (
    mcBot: MinecraftBot,
    interactionDistance: number,
    approachDistance: number
  ) {
    this.mcBot = mcBot
    this.interactionDistance = interactionDistance
    this.approachDistance = approachDistance
  }

  async boardNearest (): Promise<ServiceResult> {
    const bot = this.mcBot.bot
    if (!this.mcBot.isReady || !bot) {
      return { success: false, message: '机器人未就绪' }
    }

    if (isMountedOnMinecart(bot)) {
      return { success: false, message: '已在矿车中' }
    }

    const minecart = findNearestEntity(bot, isMinecartEntity, this.approachDistance)
    if (!minecart) {
      return {
        success: false,
        message: `${this.approachDistance} 格内未找到矿车`
      }
    }

    const approach = await approachEntity(
      bot,
      minecart,
      this.interactionDistance,
      this.approachDistance
    )
    if (!approach.success) return approach

    try {
      const boarded = await this.tryBoardMinecart(bot, minecart)
      const distance = entityDistance(bot, minecart).toFixed(1)
      if (boarded) {
        console.log(`[Minecart] 上车成功 (距离 ${distance})`)
        return { success: true, message: '已登上矿车' }
      }
      return { success: false, message: '未能登上矿车' }
    } catch (err) {
      return { success: false, message: (err as Error).message }
    }
  }

  private async tryBoardMinecart (bot: Bot, minecart: Entity): Promise<boolean> {
    const maxAttempts = 4
    await bot.unequip('hand')
    await sleep(100)

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const entity = bot.entities[minecart.id]
      if (!entity || !isMinecartEntity(entity)) return false

      const lookPoint = entityLookPoint(entity)
      await bot.activateEntityAt(entity, lookPoint)
      await sleep(400)

      if (isMountedOnMinecart(bot)) {
        console.log(`[Minecart] 上车确认成功 (第 ${attempt} 次交互)`)
        return true
      }

      bot.mount(entity)
      await sleep(400)
      if (isMountedOnMinecart(bot)) {
        console.log(`[Minecart] 上车确认成功 (mount, 第 ${attempt} 次)`)
        return true
      }

      if (attempt < maxAttempts) {
        await sleep(250)
      }
    }

    return isMountedOnMinecart(bot)
  }
}
