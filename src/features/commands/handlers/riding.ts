import type { CommandSource } from '../parser'
import type { CommandContext } from './types'
import { sleep } from '../../../platform/sleep'

export async function handleMount (
  ctx: CommandContext,
  username: string,
  target: string | undefined,
  source: CommandSource
): Promise<void> {
  if (ctx.teleportService.isLocked()) {
    await ctx.notifyLocked(username, source)
    return
  }

  const targetName = target?.trim() || username
  const currentTarget = ctx.ridingManager.getTargetPlayer()

  if (
    ctx.ridingManager.getMode() === 'player' &&
    currentTarget === targetName &&
    ctx.playerInteraction.isMountedOn(targetName)
  ) {
    await ctx.reply(username, ctx.messages.text('mountAlready', { target: targetName }), source)
    return
  }

  if (ctx.ridingManager.isActive()) {
    const dismounted = await ctx.ridingManager.dismount()
    if (!dismounted.success) {
      await ctx.reply(username, ctx.messages.text('unmountError', {
        message: dismounted.message || '下马失败'
      }), source)
      return
    }
    await sleep(400)
  }

  const result = await ctx.playerInteraction.mount(targetName)
  // mount() 已确认成功则进入骑乘模式；勿再二次检测挡住状态切换
  if (result.success) {
    ctx.ridingManager.enterPlayerMode(targetName)
  }
  await ctx.reply(username, result.success
    ? ctx.messages.text('mountSuccess', { message: result.message || '已骑乘' })
    : ctx.messages.text('mountError', { message: result.message || '骑乘失败' }), source)
}

export async function handleUnmount (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
  ctx.standby.cancelAfk()
  const result = await ctx.ridingManager.dismount()
  await ctx.reply(username, result.success
    ? ctx.messages.text('unmountSuccess', { message: result.message })
    : ctx.messages.text('unmountError', { message: result.message }), source)
}

export async function handleCart (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
  if (ctx.teleportService.isLocked()) {
    await ctx.notifyLocked(username, source)
    return
  }

  const ridingTarget = ctx.ridingManager.getTargetPlayer()
  if (
    ctx.ridingManager.getMode() === 'player' &&
    ridingTarget &&
    !ctx.playerInteraction.isMountedOn(ridingTarget)
  ) {
    ctx.ridingManager.clearMode()
  }

  const result = await ctx.minecartInteraction.boardNearest()
  if (result.success) {
    ctx.ridingManager.enterMinecartMode()
  }
  await ctx.reply(username, result.success
    ? ctx.messages.text('cartSuccess', { message: result.message || '已上车' })
    : ctx.messages.text('cartError', { message: result.message || '上车失败' }), source)
}

export async function handleAttack (
  ctx: CommandContext,
  username: string,
  target: string | undefined,
  source: CommandSource
): Promise<void> {
  const targetName = target?.trim() || username
  const result = await ctx.playerInteraction.attack(targetName)
  await ctx.reply(username, result.success
    ? ctx.messages.text('attackSuccess', { message: result.message || '已攻击' })
    : ctx.messages.text('attackError', { message: result.message || '攻击失败' }), source)
}
