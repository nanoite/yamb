import { Vec3 } from 'vec3'
import type { Item } from 'prismarine-item'
import type { ServiceResult } from '../../types'
import type MinecraftBot from '../../platform/minecraft-bot'
import { ensurePathfinder } from '../shared/entity-utils'
import { goals } from 'mineflayer-pathfinder'
import { sleep } from '../../platform/sleep'

function normalizeItemKey (name: string): string {
  return name.toLowerCase().replace(/^minecraft:/, '').trim()
}

export function findMatchingItems (items: Item[], query: string): Item[] {
  const key = normalizeItemKey(query)
  const exact = items.filter(i => normalizeItemKey(i.name) === key)
  if (exact.length > 0) return exact
  return items.filter(i => normalizeItemKey(i.name).includes(key))
}

export function formatItemList (items: Item[]): string[] {
  const merged = new Map<string, number>()
  for (const item of items) {
    const name = normalizeItemKey(item.name)
    merged.set(name, (merged.get(name) ?? 0) + item.count)
  }
  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `${name} x${count}`)
}

export default class InventoryActions {
  private mcBot: MinecraftBot

  constructor (mcBot: MinecraftBot) {
    this.mcBot = mcBot
  }

  listInventory (): ServiceResult & { lines?: string[] } {
    const bot = this.mcBot.bot
    if (!this.mcBot.isReady || !bot) {
      return { success: false, message: '机器人未就绪' }
    }

    const items = bot.inventory.items()
    if (items.length === 0) {
      return { success: true, message: '背包为空', lines: [] }
    }

    return { success: true, message: 'ok', lines: formatItemList(items) }
  }

  async dropItem (itemQuery: string, count?: number): Promise<ServiceResult> {
    const bot = this.mcBot.bot
    if (!this.mcBot.isReady || !bot) {
      return { success: false, message: '机器人未就绪' }
    }

    const matches = findMatchingItems(bot.inventory.items(), itemQuery)
    if (matches.length === 0) {
      return { success: false, message: `背包中没有 ${itemQuery}` }
    }

    const item = matches[0]
    const dropCount = count != null && count > 0
      ? Math.min(count, item.count)
      : item.count

    try {
      await bot.toss(item.type, item.metadata ?? null, dropCount)
      console.log(`[Inventory] 丢弃 ${item.name} x${dropCount}`)
      return { success: true, message: `已丢弃 ${normalizeItemKey(item.name)} x${dropCount}` }
    } catch (err) {
      return { success: false, message: (err as Error).message }
    }
  }

  async approachBlock (
    x: number,
    y: number,
    z: number,
    interactionDistance: number,
    approachDistance: number
  ): Promise<ServiceResult> {
    const bot = this.mcBot.bot
    if (!bot) return { success: false, message: '机器人未就绪' }

    const target = new Vec3(x + 0.5, y + 0.5, z + 0.5)
    let distance = bot.entity.position.distanceTo(target)
    if (distance > approachDistance) {
      return {
        success: false,
        message: `容器超过 ${approachDistance} 格 (当前 ${distance.toFixed(1)} 格)`
      }
    }

    if (distance <= interactionDistance) {
      return { success: true }
    }

    const pfBot = ensurePathfinder(bot)
    const goal = new goals.GoalNear(
      target.x,
      target.y,
      target.z,
      Math.max(1, interactionDistance - 0.5)
    )

    try {
      await pfBot.pathfinder.goto(goal)
      await sleep(150)
      distance = bot.entity.position.distanceTo(target)
      if (distance > interactionDistance + 0.5) {
        return { success: false, message: `无法接近容器 (当前 ${distance.toFixed(1)} 格)` }
      }
      return { success: true }
    } catch (err) {
      pfBot.pathfinder.stop()
      return { success: false, message: `无法接近容器: ${(err as Error).message}` }
    }
  }

  async storeInContainer (
    x: number,
    y: number,
    z: number,
    itemQuery: string,
    count: number | undefined,
    interactionDistance: number,
    approachDistance: number
  ): Promise<ServiceResult> {
    const bot = this.mcBot.bot
    if (!this.mcBot.isReady || !bot) {
      return { success: false, message: '机器人未就绪' }
    }

    const approach = await this.approachBlock(x, y, z, interactionDistance, approachDistance)
    if (!approach.success) return approach

    const matches = findMatchingItems(bot.inventory.items(), itemQuery)
    if (matches.length === 0) {
      return { success: false, message: `背包中没有 ${itemQuery}` }
    }

    const item = matches[0]
    const moveCount = count != null && count > 0
      ? Math.min(count, item.count)
      : item.count

    const block = bot.blockAt(new Vec3(x, y, z))
    if (!block) {
      return { success: false, message: '容器方块不可见' }
    }

    try {
      const chest = await bot.openContainer(block)
      await chest.deposit(item.type, item.metadata ?? null, moveCount)
      chest.close()
      console.log(`[Container] 存入 ${item.name} x${moveCount} @ ${x},${y},${z}`)
      return { success: true, message: `已存入 ${normalizeItemKey(item.name)} x${moveCount}` }
    } catch (err) {
      try { if (bot.currentWindow) bot.closeWindow(bot.currentWindow) } catch { /* */ }
      return { success: false, message: (err as Error).message }
    }
  }

  async takeFromContainer (
    x: number,
    y: number,
    z: number,
    itemQuery: string,
    count: number | undefined,
    interactionDistance: number,
    approachDistance: number
  ): Promise<ServiceResult> {
    const bot = this.mcBot.bot
    if (!this.mcBot.isReady || !bot) {
      return { success: false, message: '机器人未就绪' }
    }

    const approach = await this.approachBlock(x, y, z, interactionDistance, approachDistance)
    if (!approach.success) return approach

    const block = bot.blockAt(new Vec3(x, y, z))
    if (!block) {
      return { success: false, message: '容器方块不可见' }
    }

    try {
      const chest = await bot.openContainer(block)
      const containerItems = chest.containerItems()
      const matches = findMatchingItems(containerItems, itemQuery)
      if (matches.length === 0) {
        chest.close()
        return { success: false, message: `容器中没有 ${itemQuery}` }
      }

      const item = matches[0]
      const totalInContainer = containerItems
        .filter(i => i.type === item.type && (i.metadata ?? null) === (item.metadata ?? null))
        .reduce((sum, i) => sum + i.count, 0)
      const moveCount = count != null && count > 0
        ? Math.min(count, totalInContainer)
        : totalInContainer

      await chest.withdraw(item.type, item.metadata ?? null, moveCount)
      chest.close()
      console.log(`[Container] 取出 ${item.name} x${moveCount} @ ${x},${y},${z}`)
      return { success: true, message: `已取出 ${normalizeItemKey(item.name)} x${moveCount}` }
    } catch (err) {
      try { if (bot.currentWindow) bot.closeWindow(bot.currentWindow) } catch { /* */ }
      return { success: false, message: (err as Error).message }
    }
  }
}
