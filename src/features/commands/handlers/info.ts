import type { CommandSource } from '../parser'
import type { CommandContext } from './types'
import {
  getEntityVehicle,
  getPlayerEntity,
  getVehicle,
  isMountedOnPlayer,
  isOnPluginCloudSeat,
  isStillRidingPlayer
} from '../../../actions/shared/entity-utils'

function resolveActivityStatus (ctx: CommandContext): string {
  if (ctx.teleportService.isHoverLocked()) return '滞空锁定'
  if (ctx.teleportService.isLocked()) return '锁定'
  const mode = ctx.ridingManager.getMode()
  if (mode === 'player') return '骑乘'
  if (mode === 'minecart') return '矿车'
  return '空闲'
}

function formatPosition (ctx: CommandContext): string {
  const bot = ctx.mcBot.bot
  if (!bot) return '未知'
  const p = bot.entity.position
  return `${Math.floor(p.x)}, ${Math.floor(p.y)}, ${Math.floor(p.z)}`
}

function summarizeEntity (entity: {
  id?: number
  name?: string
  username?: string
  type?: string
  displayName?: unknown
  position?: { x: number; y: number; z: number }
  height?: number
} | null | undefined) {
  if (!entity) return null
  const displayName = typeof entity.displayName === 'string'
    ? entity.displayName
    : (entity.displayName as { toString?: () => string } | undefined)?.toString?.()
  return {
    id: entity.id,
    type: entity.type,
    name: entity.name,
    username: entity.username,
    displayName: displayName || undefined,
    height: entity.height,
    pos: entity.position
      ? {
          x: Number(entity.position.x.toFixed(3)),
          y: Number(entity.position.y.toFixed(3)),
          z: Number(entity.position.z.toFixed(3))
        }
      : undefined
  }
}

/** 仅写控制台，便于排查插件骑乘时的 vehicle / 位置等信号 */
function logMountDebug (ctx: CommandContext, username: string): void {
  const bot = ctx.mcBot.bot
  if (!bot) {
    console.log('[Status:mount-debug] bot 未就绪')
    return
  }

  const botVehicle = getVehicle(bot)
  const entityVehicle = getEntityVehicle(bot)
  const targetName = ctx.ridingManager.getTargetPlayer() || username
  const player = getPlayerEntity(bot, targetName)
  const entityAny = bot.entity as unknown as Record<string, unknown>
  const botAny = bot as unknown as Record<string, unknown>

  let horiz: number | null = null
  let dy: number | null = null
  let dist: number | null = null
  if (player) {
    horiz = Math.hypot(
      bot.entity.position.x - player.position.x,
      bot.entity.position.z - player.position.z
    )
    dy = bot.entity.position.y - player.position.y
    dist = bot.entity.position.distanceTo(player.position)
  }

  const playerPassengers = (player as { passengers?: unknown[] } | null)?.passengers
  const botPassengers = (bot.entity as { passengers?: unknown[] }).passengers

  const nearbyPlayers: Array<Record<string, unknown>> = []
  for (const id of Object.keys(bot.entities)) {
    const e = bot.entities[id]
    if (!e || e === bot.entity || e.type !== 'player') continue
    const d = bot.entity.position.distanceTo(e.position)
    if (d > 4) continue
    const h = Math.hypot(bot.entity.position.x - e.position.x, bot.entity.position.z - e.position.z)
    const y = bot.entity.position.y - e.position.y
    const passengers = (e as { passengers?: unknown[] }).passengers
    nearbyPlayers.push({
      ...summarizeEntity(e),
      dist: Number(d.toFixed(3)),
      horiz: Number(h.toFixed(3)),
      dy: Number(y.toFixed(3)),
      passengerCount: Array.isArray(passengers) ? passengers.length : passengers ?? null,
      firstPassenger: summarizeEntity(Array.isArray(passengers) ? passengers[0] as never : null)
    })
  }

  let vehicleHoriz: number | null = null
  if (botVehicle) {
    vehicleHoriz = Math.hypot(
      bot.entity.position.x - botVehicle.position.x,
      bot.entity.position.z - botVehicle.position.z
    )
  }

  console.log('[Status:mount-debug]', JSON.stringify({
    askedBy: username,
    ridingMode: ctx.ridingManager.getMode(),
    ridingTarget: ctx.ridingManager.getTargetPlayer(),
    locked: ctx.teleportService.isLocked(),
    bot: {
      username: bot.username,
      onGround: bot.entity.onGround,
      yaw: Number(bot.entity.yaw.toFixed(3)),
      pitch: Number(bot.entity.pitch.toFixed(3)),
      pos: {
        x: Number(bot.entity.position.x.toFixed(3)),
        y: Number(bot.entity.position.y.toFixed(3)),
        z: Number(bot.entity.position.z.toFixed(3))
      },
      velocity: bot.entity.velocity
        ? {
            x: Number(bot.entity.velocity.x.toFixed(3)),
            y: Number(bot.entity.velocity.y.toFixed(3)),
            z: Number(bot.entity.velocity.z.toFixed(3))
          }
        : undefined,
      control: {
        sneak: bot.controlState.sneak,
        jump: bot.controlState.jump,
        forward: bot.controlState.forward
      }
    },
    vehicle: {
      botVehicle: summarizeEntity(botVehicle),
      entityVehicle: summarizeEntity(entityVehicle),
      vehicleHoriz: vehicleHoriz != null ? Number(vehicleHoriz.toFixed(3)) : null,
      isOnPluginCloudSeat: isOnPluginCloudSeat(bot),
      rawBotVehicleTruthy: !!botAny.vehicle,
      rawEntityVehicleTruthy: !!entityAny.vehicle,
      entityKeysSample: Object.keys(entityAny).filter(k =>
        /ride|mount|vehicle|passenger|sit|attach/i.test(k)
      )
    },
    passengers: {
      botPassengerCount: Array.isArray(botPassengers) ? botPassengers.length : botPassengers ?? null,
      targetPassengerCount: Array.isArray(playerPassengers) ? playerPassengers.length : playerPassengers ?? null,
      targetFirstPassenger: summarizeEntity(
        Array.isArray(playerPassengers) ? playerPassengers[0] as never : null
      )
    },
    relativeToTarget: {
      target: targetName,
      playerFound: !!player,
      player: summarizeEntity(player),
      dist: dist != null ? Number(dist.toFixed(3)) : null,
      horiz: horiz != null ? Number(horiz.toFixed(3)) : null,
      dy: dy != null ? Number(dy.toFixed(3)) : null,
      isMountedOnPlayer: player ? isMountedOnPlayer(bot, targetName) : false,
      isStillRidingPlayer: player ? isStillRidingPlayer(bot, targetName) : false
    },
    nearbyPlayers
  }, null, 2))
}

export async function handleStatus (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
  logMountDebug(ctx, username)

  const uptimeSec = Math.floor(process.uptime())
  const hours = Math.floor(uptimeSec / 3600)
  const minutes = Math.floor((uptimeSec % 3600) / 60)

  const lines = [
    `状态: ${resolveActivityStatus(ctx)}`,
    `运行: ${hours}h ${minutes}m`,
    `位置: ${formatPosition(ctx)}`
  ]
  await ctx.reply(username, lines.join('\n'), source)
}

export async function handleHelp (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
  const lines = ctx.messages.lines('helpLines', { waypoints: ctx.waypointHint() })
  await ctx.reply(username, lines.join('\n'), source)
}
