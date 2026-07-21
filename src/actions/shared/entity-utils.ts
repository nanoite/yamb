import { Vec3 } from 'vec3'
import type { Bot } from 'mineflayer'
import { pathfinder, Movements, goals } from 'mineflayer-pathfinder'
import type { ServiceResult } from '../../types'
import { sleep } from '../../platform/sleep'

type Entity = NonNullable<Bot['entities'][string]>

export type BotWithPathfinder = Bot & {
  _mchatbotPathfinderReady?: boolean
  pathfinder: {
    setMovements: (movements: Movements) => void
    goto: (goal: goals.GoalNear) => Promise<void>
    stop: () => void
  }
}

type EntityWithVehicle = Entity & { vehicle?: Entity | null; passengers?: Entity[] }

export type BotWithVehicle = Bot & { vehicle?: Entity | null }

export function ensurePathfinder (bot: Bot): BotWithPathfinder {
  const b = bot as BotWithPathfinder
  if (!b._mchatbotPathfinderReady) {
    bot.loadPlugin(pathfinder)
    b.pathfinder.setMovements(new Movements(bot))
    b._mchatbotPathfinderReady = true
  }
  return b
}

export function entityDistance (bot: Bot, entity: Entity): number {
  return bot.entity.position.distanceTo(entity.position)
}

export function entityLookPoint (entity: Entity) {
  return entity.position.offset(0, entity.height * 0.85, 0)
}

export function getPlayerEntity (bot: Bot, playerName: string): Entity | null {
  const entity = bot.players[playerName]?.entity
  if (entity) return entity

  for (const id of Object.keys(bot.entities)) {
    const e = bot.entities[id]
    if (e.type === 'player' && e.username === playerName) return e
  }
  return null
}

export function getVehicle (bot: Bot): Entity | null {
  return (bot as BotWithVehicle).vehicle ?? null
}

export function getEntityVehicle (bot: Bot): Entity | null {
  return (bot.entity as EntityWithVehicle).vehicle ?? null
}

export function clearVehicleState (bot: Bot): void {
  ;(bot as BotWithVehicle).vehicle = null
  if (bot.entity) {
    (bot.entity as { vehicle?: Entity | null }).vehicle = null
  }
}

export function isMinecartEntity (entity: Entity): boolean {
  const name = String(entity.name || entity.displayName || '').toLowerCase()
  return name.includes('minecart')
}

export function isMountedOnPlayer (bot: Bot, playerName: string): boolean {
  const player = getPlayerEntity(bot, playerName)
  if (!player) return false

  const horizontal = Math.hypot(
    bot.entity.position.x - player.position.x,
    bot.entity.position.z - player.position.z
  )
  const dy = bot.entity.position.y - player.position.y
  const physicallyRiding = horizontal < 1.8 && dy >= -0.5 && dy <= 2.5

  if (physicallyRiding) return true

  const vehicle = getVehicle(bot) ?? getEntityVehicle(bot)
  if (!vehicle) return false

  const onPlayer = vehicle === player || vehicle.username === playerName
  if (!onPlayer) return false

  return horizontal < 2.5 && dy >= -1 && dy <= 3
}

export function isMountedOnMinecart (bot: Bot): boolean {
  const vehicle = getVehicle(bot) ?? getEntityVehicle(bot)
  if (!vehicle || !isMinecartEntity(vehicle)) return false
  return entityDistance(bot, vehicle) < 2.5
}

export async function performDismount (bot: Bot): Promise<boolean> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    bot.setControlState('sneak', true)
    await sleep(300)
    bot.dismount()
    await sleep(300)
    bot.setControlState('sneak', false)
    bot.clearControlStates()
    clearVehicleState(bot)
    await sleep(250)

    if (!getVehicle(bot) && !getEntityVehicle(bot)) {
      await settleOnGround(bot)
      return true
    }
  }

  clearVehicleState(bot)
  await settleOnGround(bot)
  return !getVehicle(bot) && !getEntityVehicle(bot)
}

export async function settleOnGround (bot: Bot): Promise<void> {
  bot.clearControlStates()

  for (let i = 0; i < 15; i++) {
    await sleep(100)
    if (bot.entity.onGround) return
  }

  const pos = bot.entity.position
  const feetX = Math.floor(pos.x)
  const feetZ = Math.floor(pos.z)
  let standY: number | null = null

  for (let y = Math.floor(pos.y); y >= Math.floor(pos.y) - 8; y--) {
    const block = bot.blockAt(new Vec3(feetX, y, feetZ))
    if (block && block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
      standY = y + 1
      break
    }
  }

  if (standY != null) {
    const pfBot = ensurePathfinder(bot)
    try {
      await pfBot.pathfinder.goto(new goals.GoalNear(feetX + 0.5, standY, feetZ + 0.5, 0.8))
      await sleep(300)
    } catch {
      pfBot.pathfinder.stop()
    }
  }

  bot.clearControlStates()
  for (let i = 0; i < 8; i++) {
    if (bot.entity.onGround) return
    bot.setControlState('forward', true)
    await sleep(120)
    bot.setControlState('forward', false)
    await sleep(120)
  }
  bot.clearControlStates()
}

export async function approachEntity (
  bot: Bot,
  entity: Entity,
  interactionDistance: number,
  approachDistance: number
): Promise<ServiceResult> {
  let distance = entityDistance(bot, entity)
  if (distance > approachDistance) {
    return {
      success: false,
      message: `目标超过 ${approachDistance} 格 (当前 ${distance.toFixed(1)} 格)`
    }
  }

  if (distance <= interactionDistance) {
    return { success: true }
  }

  const pfBot = ensurePathfinder(bot)
  const goal = new goals.GoalNear(
    entity.position.x,
    entity.position.y,
    entity.position.z,
    Math.max(1, interactionDistance - 0.5)
  )

  try {
    console.log(`[Approach] 接近目标 (${distance.toFixed(1)} -> ${interactionDistance} 格)`)
    await pfBot.pathfinder.goto(goal)
    await sleep(150)
    distance = entityDistance(bot, entity)
    if (distance > interactionDistance + 0.5) {
      return {
        success: false,
        message: `无法进入交互距离 (当前 ${distance.toFixed(1)} 格，需要 ${interactionDistance} 格内)`
      }
    }
    return { success: true }
  } catch (err) {
    pfBot.pathfinder.stop()
    return { success: false, message: `无法接近目标: ${(err as Error).message}` }
  }
}

export function findNearestEntity (
  bot: Bot,
  predicate: (entity: Entity) => boolean,
  maxDistance: number
): Entity | null {
  let nearest: Entity | null = null
  let nearestDistance = maxDistance

  for (const id of Object.keys(bot.entities)) {
    const entity = bot.entities[id]
    if (entity === bot.entity) continue
    if (!predicate(entity)) continue

    const distance = entityDistance(bot, entity)
    if (distance <= nearestDistance) {
      nearest = entity
      nearestDistance = distance
    }
  }

  return nearest
}
