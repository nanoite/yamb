export function stripMcFormatting (text: string): string {
  return text.replace(/§./g, '').trim()
}

export function normalizeInput (text: string): string {
  return stripMcFormatting(text).replace(/^\/+/, '').trim()
}

export function matchesPrefix (text: string, prefix: string): boolean {
  const normalized = normalizeInput(text)
  if (normalized === prefix) return true
  return normalized.startsWith(`${prefix} `)
}

export function parsePrefixedArgs (text: string, prefix: string): string[] {
  const normalized = normalizeInput(text)
  if (!matchesPrefix(normalized, prefix)) return []
  const rest = normalized.slice(prefix.length).trim()
  if (!rest) return []
  return rest.split(/\s+/)
}

export const KNOWN_COMMANDS = new Set([
  'phome', 'lock', 'unlock', 'add', 'remove', 'status', 'say', 'forward',
  'help', '帮助', 'mount', 'unmount', 'cart', 'attack', 'container',
  'inv', 'store', 'take', 'drop'
])

export function isKnownCommand (cmd: string): boolean {
  return KNOWN_COMMANDS.has(cmd.toLowerCase())
}

export function parseWhisperCommand (text: string): string[] | null {
  const normalized = normalizeInput(text)
  if (!normalized) return null
  const parts = normalized.split(/\s+/)
  const cmd = parts[0]?.toLowerCase()
  if (!cmd || !isKnownCommand(cmd)) return null
  return parts
}

export function parsePublicCommand (text: string, prefix: string): string[] | null {
  if (!matchesPrefix(text, prefix)) return null
  const args = parsePrefixedArgs(text, prefix)
  if (args.length === 0) return null
  return args
}

export type CommandSource = 'chat' | 'whisper'

export function parseCommandInput (
  text: string,
  prefix: string,
  source: CommandSource,
  allowPublicCommands: boolean
): string[] | null {
  if (source === 'whisper') {
    return parseWhisperCommand(text)
  }
  if (!allowPublicCommands) return null
  return parsePublicCommand(text, prefix)
}
