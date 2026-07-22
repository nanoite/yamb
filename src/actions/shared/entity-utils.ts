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

export function isAreaEffectCloudEntity (entity: Entity): boolean {
  return String(entity.name || entity.displayName || '').toLowerCase().includes('area_effect_cloud')
}

/** 是否正坐在插件用的 area_effect_cloud 坐骑上（与云水平重合） */
export function isOnPluginCloudSeat (bot: Bot): boolean {
  const vehicle = getVehicle(bot) ?? getEntityVehicle(bot)
  if (!vehicle || !isAreaEffectCloudEntity(vehicle)) return false
  const horizontal = Math.hypot(
    bot.entity.position.x - vehicle.position.x,
    bot.entity.position.z - vehicle.position.z
  )
  return horizontal < 0.75
}

function isLockedToPlayerEntity (bot: Bot, player: Entity): boolean {
  const horizontal = Math.hypot(
    bot.entity.position.x - player.position.x,
    bot.entity.position.z - player.position.z
  )
  const dy = bot.entity.position.y - player.position.y
  // 骑乘日志：horiz≈0、dy≈0.2；未骑乘时 horiz 通常 >1
  return horizontal < 0.75 && dy >= -0.25 && dy <= 1.25
}

export function isMountedOnPlayer (bot: Bot, playerName: string): boolean {
  const player = getPlayerEntity(bot, playerName)
  if (!player) return false

  const vehicle = getVehicle(bot) ?? getEntityVehicle(bot)
  if (vehicle && (vehicle === player || vehicle.username === playerName)) {
    return true
  }

  // 本服坐骑插件：必须同时「锁在玩家 xz」且「坐在对齐的 AEC 云上」
  // 注意：下马后常会短暂悬空（!onGround），不能再用悬空当骑乘依据，否则会误判失败并卡在半空
  if (!isLockedToPlayerEntity(bot, player)) return false
  return isOnPluginCloudSeat(bot)
}

/** 主动下马后的确认 */
export function isStillRidingPlayer (bot: Bot, playerName: string): boolean {
  return isMountedOnPlayer(bot, playerName)
}

export function isMountedOnMinecart (bot: Bot): boolean {
  const vehicle = getVehicle(bot) ?? getEntityVehicle(bot)
  if (!vehicle || !isMinecartEntity(vehicle)) return false
  return entityDistance(bot, vehicle) < 2.5
}

/** 是否仍挂在“有效载具”上（忽略未对齐的残留 AEC 引用） */
export function hasActiveVehicle (bot: Bot): boolean {
  const vehicle = getVehicle(bot) ?? getEntityVehicle(bot)
  if (!vehicle) return false
  if (isAreaEffectCloudEntity(vehicle)) return isOnPluginCloudSeat(bot)
  return true
}

/**
 * Mineflayer 在 mount 时会把内部 shouldUsePhysics 设为 false，
 * 但 dismount 后不会自动恢复（只有服务端传送包才会）。
 * 触发一次相对位移为 0 的内部 position 处理以恢复物理；不主动改坐标。
 */
export function resumeBotPhysics (bot: Bot): void {
  bot.physicsEnabled = true
  clearVehicleState(bot)

  try {
    bot._client.emit('position', {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      flags: { x: true, y: true, z: true, yaw: true, pitch: true },
      teleportId: 0
    })
    console.log('[Physics] 已恢复物理结算')
  } catch (err) {
    console.warn('[Physics] 恢复物理失败:', (err as Error).message)
  }
}

/** 关闭物理模拟：停止本地重力，位置由 bot 维持（可悬空） */
export function suspendBotPhysics (bot: Bot): void {
  bot.clearControlStates()
  if (bot.entity.velocity) {
    bot.entity.velocity.set(0, 0, 0)
  }
  bot.physicsEnabled = false
  console.log('[Physics] 已关闭物理结算（悬空）')
}

/**
 * 跳起后关闭物理，实现悬空。
 * @param riseMs 起跳后等待上升的时间再冻结
 */
export async function jumpAndHover (bot: Bot, riseMs = 250): Promise<boolean> {
  resumeBotPhysics(bot)
  bot.clearControlStates()

  bot.setControlState('jump', true)
  await sleep(80)
  bot.setControlState('jump', false)

  for (let i = 0; i < 20; i++) {
    await sleep(50)
    if (!bot.entity.onGround) break
  }

  if (bot.entity.onGround) {
    console.warn('[Physics] 未能离地，取消悬空')
    return false
  }

  await sleep(riseMs)
  suspendBotPhysics(bot)
  return true
}

/** 恢复物理并等待自然落地（不强制改写坐标包） */
export async function waitForNaturalLanding (bot: Bot, timeoutMs = 3000): Promise<boolean> {
  bot.clearControlStates()
  clearVehicleState(bot)
  resumeBotPhysics(bot)

  if (bot.entity.onGround) return true

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (bot.entity.onGround) return true
    const block = bot.blockAt(bot.entity.position, false)
    if (block == null) {
      console.warn('[Settle] 当前位置 chunk 未加载，等待地形...')
    }
    await sleep(50)
  }

  console.warn(
    `[Settle] 等待自然落地超时 y=${bot.entity.position.y.toFixed(2)}` +
    ` onGround=${bot.entity.onGround} physicsEnabled=${bot.physicsEnabled}`
  )
  return bot.entity.onGround
}

/** @deprecated 使用 waitForNaturalLanding */
export async function forceLand (bot: Bot): Promise<void> {
  await waitForNaturalLanding(bot)
}

/** 离开插件 AEC 坐骑：以潜行为主（bot.dismount 对此类载具常报 not mounted） */
export async function leavePluginSeat (bot: Bot): Promise<boolean> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    bot.setControlState('sneak', true)
    await sleep(attempt <= 2 ? 450 : 650)

    try {
      bot.dismount()
    } catch {
      // 插件云座下 mineflayer 常抛 dismount: not mounted，忽略即可
    }

    bot.setControlState('sneak', false)
    bot.clearControlStates()
    clearVehicleState(bot)
    await sleep(250)

    if (!hasActiveVehicle(bot) && !isOnPluginCloudSeat(bot)) {
      console.log(`[Riding] 已离开云座 (第 ${attempt} 次潜行)`)
      resumeBotPhysics(bot)
      return true
    }
  }

  clearVehicleState(bot)
  resumeBotPhysics(bot)
  return !hasActiveVehicle(bot) && !isOnPluginCloudSeat(bot)
}

export async function performDismount (
  bot: Bot,
  isStillMounted?: () => boolean
): Promise<boolean> {
  const leftSeat = await leavePluginSeat(bot)
  const stillMounted = isStillMounted?.() ?? false

  await waitForNaturalLanding(bot)

  if (leftSeat && !stillMounted) return true
  if (!hasActiveVehicle(bot) && !(isStillMounted?.() ?? false)) return true
  return false
}

export async function settleOnGround (bot: Bot): Promise<void> {
  await waitForNaturalLanding(bot)
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
