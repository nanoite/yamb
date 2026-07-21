import type { Bot } from 'mineflayer'
import { sleep } from '../../platform/sleep'

const FULL_FOOD = 20

export async function eatGoldenCarrotsUntilFull (bot: Bot): Promise<void> {
  if (bot.food >= FULL_FOOD) return

  while (bot.food < FULL_FOOD) {
    const item = bot.inventory.items().find(i => i.name === 'golden_carrot')
    if (!item) {
      console.log('[Food] 背包中没有金胡萝卜')
      break
    }

    try {
      await bot.equip(item, 'hand')
      await bot.consume()
      await sleep(350)
    } catch (err) {
      console.warn('[Food] 进食失败:', (err as Error).message)
      break
    }
  }

  if (bot.food >= FULL_FOOD) {
    console.log('[Food] 饥饿值已满')
  }
}
