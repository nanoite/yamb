import type { CommandSource } from '../parser'
import type { CommandContext } from './types'

function resolveActivityStatus (ctx: CommandContext): string {
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

export async function handleStatus (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
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
