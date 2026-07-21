const CONTAINER_BLOCKS = new Set([
  'chest',
  'trapped_chest',
  'barrel',
  'shulker_box',
  'ender_chest',
  'hopper',
  'dispenser',
  'dropper',
  'furnace',
  'blast_furnace',
  'smoker',
  'brewing_stand'
])

export function normalizeContainerType (blockName: string): string | null {
  const name = blockName.replace(/^minecraft:/, '')
  if (CONTAINER_BLOCKS.has(name)) return name
  if (name.endsWith('_shulker_box')) return 'shulker_box'
  return null
}

export function getTargetContainerBlock (bot: import('mineflayer').Bot, maxDistance = 5) {
  const block = bot.blockAtCursor(maxDistance)
  if (!block) return null
  const type = normalizeContainerType(block.name)
  if (!type) return null
  return { block, type }
}
