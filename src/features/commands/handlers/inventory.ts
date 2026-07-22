import type { CommandSource } from '../parser'
import type { CommandContext } from './types'
import { getTargetContainerBlock } from '../../container/utils'

export async function handleContainer (
  ctx: CommandContext,
  username: string,
  parts: string[],
  source: CommandSource
): Promise<void> {
  const sub = (parts.shift() || '').toLowerCase()
  switch (sub) {
    case 'add':
      await handleContainerAdd(ctx, username, parts[0], source)
      break
    case 'remove':
      await handleContainerRemove(ctx, username, parts[0], source)
      break
    case 'list':
      await handleContainerList(ctx, username, source)
      break
    case 'info':
      await handleContainerInfo(ctx, username, parts[0], source)
      break
    default:
      await ctx.reply(username, [
        ctx.messages.text('containerAddUsage'),
        ctx.messages.text('containerRemoveUsage'),
        ctx.messages.text('containerInfoUsage'),
        'container list — 列出容器'
      ].join('\n'), source)
  }
}

async function handleContainerAdd (
  ctx: CommandContext,
  username: string,
  alias: string | undefined,
  source: CommandSource
): Promise<void> {
  if (!ctx.isAdmin(username)) {
    await ctx.reply(username, ctx.messages.text('noPermission'), source)
    return
  }
  if (!alias) {
    await ctx.reply(username, ctx.messages.text('containerAddUsage'), source)
    return
  }

  const bot = ctx.mcBot.bot
  if (!bot) {
    await ctx.reply(username, ctx.messages.text('containerNoTarget'), source)
    return
  }

  const target = getTargetContainerBlock(bot)
  if (!target) {
    await ctx.reply(username, ctx.messages.text('containerNoTarget'), source)
    return
  }

  const pos = target.block.position
  ctx.containerRegistry.add({
    alias,
    type: target.type,
    x: pos.x,
    y: pos.y,
    z: pos.z,
    dimension: bot.game?.dimension || 'overworld',
    addedBy: username
  })

  await ctx.reply(username, ctx.messages.text('containerAddSuccess', {
    alias,
    type: target.type,
    x: pos.x,
    y: pos.y,
    z: pos.z
  }), source)
}

async function handleContainerRemove (
  ctx: CommandContext,
  username: string,
  alias: string | undefined,
  source: CommandSource
): Promise<void> {
  if (!ctx.isAdmin(username)) {
    await ctx.reply(username, ctx.messages.text('noPermission'), source)
    return
  }
  if (!alias) {
    await ctx.reply(username, ctx.messages.text('containerRemoveUsage'), source)
    return
  }
  if (!ctx.containerRegistry.remove(alias)) {
    await ctx.reply(username, ctx.messages.text('containerRemoveNotFound', { alias }), source)
    return
  }
  await ctx.reply(username, ctx.messages.text('containerRemoveSuccess', { alias }), source)
}

async function handleContainerList (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
  const list = ctx.containerRegistry.list()
  if (list.length === 0) {
    await ctx.reply(username, ctx.messages.text('containerListEmpty'), source)
    return
  }

  const lines = [
    ctx.messages.text('containerListHeader', { count: list.length }),
    ...list.map(c => ctx.messages.text('containerListEntry', {
      alias: c.alias,
      type: c.type,
      x: c.x,
      y: c.y,
      z: c.z
    }))
  ]
  await ctx.reply(username, lines.join('\n'), source)
}

async function handleContainerInfo (
  ctx: CommandContext,
  username: string,
  alias: string | undefined,
  source: CommandSource
): Promise<void> {
  if (!alias) {
    await ctx.reply(username, ctx.messages.text('containerInfoUsage'), source)
    return
  }
  const info = ctx.containerRegistry.get(alias)
  if (!info) {
    await ctx.reply(username, ctx.messages.text('containerInfoNotFound', { alias }), source)
    return
  }
  const lines = ctx.messages.lines('containerInfoLines', {
    alias: info.alias,
    type: info.type,
    x: info.x,
    y: info.y,
    z: info.z,
    dimension: info.dimension,
    addedBy: info.addedBy,
    date: info.addedAt.slice(0, 10)
  })
  await ctx.reply(username, lines.join('\n'), source)
}

export async function handleInv (
  ctx: CommandContext,
  username: string,
  source: CommandSource
): Promise<void> {
  if (!ctx.isAdmin(username)) {
    await ctx.reply(username, ctx.messages.text('noPermission'), source)
    return
  }

  const result = ctx.inventoryActions.listInventory()
  if (!result.success) {
    await ctx.reply(username, ctx.messages.text('invError', { message: result.message || '失败' }), source)
    return
  }

  if (!result.lines?.length) {
    await ctx.reply(username, ctx.messages.text('invEmpty'), source)
    return
  }

  const header = ctx.messages.text('invHeader', { count: result.lines.length })
  await ctx.reply(username, [header, ...result.lines].join('\n'), source)
}

export async function handleStore (
  ctx: CommandContext,
  username: string,
  parts: string[],
  source: CommandSource
): Promise<void> {
  const alias = parts[0]
  const itemQuery = parts[1]
  const count = parts[2] ? parseInt(parts[2], 10) : undefined

  if (!alias || !itemQuery) {
    await ctx.reply(username, ctx.messages.text('storeUsage'), source)
    return
  }

  const record = ctx.containerRegistry.get(alias)
  if (!record) {
    await ctx.reply(username, ctx.messages.text('containerInfoNotFound', { alias }), source)
    return
  }

  const result = await ctx.inventoryActions.storeInContainer(
    record.x,
    record.y,
    record.z,
    itemQuery,
    Number.isFinite(count) ? count : undefined,
    ctx.interactionDistance,
    ctx.approachDistance
  )
  await ctx.reply(username, result.success
    ? ctx.messages.text('storeSuccess', { message: result.message || '已存入' })
    : ctx.messages.text('storeError', { message: result.message || '存入失败' }), source)
}

export async function handleTake (
  ctx: CommandContext,
  username: string,
  parts: string[],
  source: CommandSource
): Promise<void> {
  const alias = parts[0]
  const itemQuery = parts[1]
  const count = parts[2] ? parseInt(parts[2], 10) : undefined

  if (!alias || !itemQuery) {
    await ctx.reply(username, ctx.messages.text('takeUsage'), source)
    return
  }

  const record = ctx.containerRegistry.get(alias)
  if (!record) {
    await ctx.reply(username, ctx.messages.text('containerInfoNotFound', { alias }), source)
    return
  }

  const result = await ctx.inventoryActions.takeFromContainer(
    record.x,
    record.y,
    record.z,
    itemQuery,
    Number.isFinite(count) ? count : undefined,
    ctx.interactionDistance,
    ctx.approachDistance
  )
  await ctx.reply(username, result.success
    ? ctx.messages.text('takeSuccess', { message: result.message || '已取出' })
    : ctx.messages.text('takeError', { message: result.message || '取出失败' }), source)
}

export async function handleDrop (
  ctx: CommandContext,
  username: string,
  parts: string[],
  source: CommandSource
): Promise<void> {
  const itemQuery = parts[0]
  const count = parts[1] ? parseInt(parts[1], 10) : undefined

  if (!itemQuery) {
    await ctx.reply(username, ctx.messages.text('dropUsage'), source)
    return
  }

  const result = await ctx.inventoryActions.dropItem(
    itemQuery,
    Number.isFinite(count) ? count : undefined
  )
  await ctx.reply(username, result.success
    ? ctx.messages.text('dropSuccess', { message: result.message || '已丢弃' })
    : ctx.messages.text('dropError', { message: result.message || '丢弃失败' }), source)
}
