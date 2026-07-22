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
  arg: string | undefined,
  source: CommandSource
): Promise<void> {
  if (ctx.teleportService.isLocked()) {
    await ctx.reply(username, ctx.messages.text('lockAlready'), source)
    return
  }

  const mode = (arg || '').toLowerCase().trim()
  if (mode && mode !== 'hover') {
    await ctx.reply(username, ctx.messages.text('lockUsage'), source)
    return
  }

  const hover = mode === 'hover'
  const result = await ctx.teleportService.prepareAndLock(username, { hover })

  if (!result.success) {
    if (result.code === 'hover_failed' || result.code === 'not_ready') {
      await ctx.reply(username, ctx.messages.text('lockHoverFailed'), source)
      return
    }
    await ctx.reply(username, ctx.messages.text('lockAlready'), source)
    return
  }

  await ctx.reply(
    username,
    ctx.messages.text(hover ? 'lockHoverSuccess' : 'lockSuccess'),
    source
  )
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
