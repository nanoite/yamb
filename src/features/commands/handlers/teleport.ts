import type { CommandSource } from '../parser'
import type { CommandContext } from './types'

export async function handlePhome (
  ctx: CommandContext,
  username: string,
  alias: string | undefined,
  source: CommandSource
): Promise<void> {
  if (!alias) {
    await ctx.reply(username, ctx.messages.text('phomeUsage', { waypoints: ctx.waypointHint() }), source)
    return
  }

  const result = await ctx.teleportService.goToPlayerViaWaypoint(username, alias)
  if (result.code === 'locked') {
    await ctx.notifyLocked(username, source)
    return
  }
  if (!result.success && result.message) {
    await ctx.reply(username, ctx.messages.text('phomeError', { message: result.message }), source)
  }
}

export async function handleLock (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
  if (ctx.teleportService.isLocked()) {
    await ctx.reply(username, ctx.messages.text('lockAlready'), source)
    return
  }
  ctx.teleportService.lock(username)
  await ctx.reply(username, ctx.messages.text('lockSuccess'), source)
}

export async function handleUnlock (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
  if (!ctx.teleportService.isLocked()) {
    await ctx.reply(username, ctx.messages.text('unlockNotLocked'), source)
    return
  }
  ctx.teleportService.unlock()
  await ctx.reply(username, ctx.messages.text('unlockSuccess'), source)
}
