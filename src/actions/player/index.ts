import type { Bot } from 'mineflayer'
import type { ServiceResult } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import { sleep } from '../../platform/sleep'
import {
  approachEntity,
  entityDistance,
  entityLookPoint,
  getPlayerEntity,
  isMountedOnPlayer,
  isOnPluginCloudSeat
} from '../shared/entity-utils'

export default class PlayerInteractionService {
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

  getApproachDistance (): number {
    return this.approachDistance
  }

  isPlayerInRange (targetName: string): boolean {
    const bot = this.mcBot.bot
    if (!bot) return false
    const entity = getPlayerEntity(bot, targetName)
    if (!entity) return false
    return entityDistance(bot, entity) <= this.approachDistance
  }

  isMountedOn (targetName: string): boolean {
    const bot = this.mcBot.bot
    if (!bot) return false
    return isMountedOnPlayer(bot, targetName)
  }

  async mount (targetName: string): Promise<ServiceResult> {
    return this.interactWithPlayer(targetName, 'mount')
  }

  async attack (targetName: string): Promise<ServiceResult> {
    return this.interactWithPlayer(targetName, 'attack')
  }

  async remountPlayer (targetName: string): Promise<boolean> {
    const bot = this.mcBot.bot
    if (!this.mcBot.isReady || !bot) return false

    const entity = getPlayerEntity(bot, targetName)
    if (!entity) return false

    const approach = await approachEntity(
      bot,
      entity,
      this.interactionDistance,
      this.approachDistance
    )
    if (!approach.success) return false

    return this.tryMountPlayer(bot, targetName)
  }

  private async interactWithPlayer (
    targetName: string,
    action: 'mount' | 'attack'
  ): Promise<ServiceResult> {
    const bot = this.mcBot.bot
    if (!this.mcBot.isReady || !bot) {
      return { success: false, message: '机器人未就绪' }
    }

    const entity = getPlayerEntity(bot, targetName)
    if (!entity) {
      return { success: false, message: `玩家 ${targetName} 不在线或不可见` }
    }

    const approach = await approachEntity(
      bot,
      entity,
      this.interactionDistance,
      this.approachDistance
    )
    if (!approach.success) return approach

    try {
      if (action === 'mount') {
        const mounted = await this.tryMountPlayer(bot, targetName)
        const distance = entityDistance(bot, getPlayerEntity(bot, targetName) ?? entity).toFixed(1)
        if (mounted) {
          console.log(`[Interaction] 骑乘 ${targetName} 成功 (距离 ${distance})`)
          return { success: true, message: `已骑乘 ${targetName}` }
        }
        console.log(`[Interaction] 骑乘 ${targetName} 失败 (距离 ${distance})`)
        return { success: false, message: `未能骑乘 ${targetName}，请确认距离与服务器插件支持` }
      }

      const target = getPlayerEntity(bot, targetName) ?? entity
      const lookPoint = entityLookPoint(target)
      await bot.lookAt(lookPoint, true)
      await sleep(200)
      bot.attack(target)
      console.log(`[Interaction] 攻击 ${targetName}`)
      return { success: true, message: `已攻击 ${targetName}` }
    } catch (err) {
      console.error(`[Interaction] ${action} 失败:`, (err as Error).message)
      return { success: false, message: (err as Error).message }
    }
  }

  private async tryMountPlayer (bot: Bot, targetName: string): Promise<boolean> {
    const maxAttempts = 4
    await bot.unequip('hand')
    await sleep(100)

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const entity = getPlayerEntity(bot, targetName)
      if (!entity) return false

      const lookPoint = entityLookPoint(entity)
      await bot.activateEntityAt(entity, lookPoint)
      await sleep(500)

      if (isMountedOnPlayer(bot, targetName)) {
        const dist = entityDistance(bot, getPlayerEntity(bot, targetName) ?? entity).toFixed(1)
        console.log(`[Interaction] 骑乘确认成功 (第 ${attempt} 次交互, 距离 ${dist}, cloudSeat=${isOnPluginCloudSeat(bot)})`)
        return true
      }

      const current = getPlayerEntity(bot, targetName) ?? entity
      const horizontal = Math.hypot(
        bot.entity.position.x - current.position.x,
        bot.entity.position.z - current.position.z
      )
      const dy = bot.entity.position.y - current.position.y
      console.log(
        `[Interaction] 未骑乘，重试 activateEntityAt (${attempt}/${maxAttempts})` +
        ` horiz=${horizontal.toFixed(2)} dy=${dy.toFixed(2)}` +
        ` onGround=${bot.entity.onGround} cloudSeat=${isOnPluginCloudSeat(bot)}`
      )

      if (attempt < maxAttempts) {
        await sleep(250)
      }
    }

    return isMountedOnPlayer(bot, targetName)
  }
}
