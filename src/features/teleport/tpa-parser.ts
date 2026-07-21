export type IncomingTeleportType = 'tpa' | 'tpahere'

export interface IncomingTeleportRequest {
  playerName: string
  type: IncomingTeleportType
}

export function parseIncomingTeleportRequest (text: string): IncomingTeleportRequest | null {
  const trimmed = text.trim()

  const patterns: Array<{ type: IncomingTeleportType; regex: RegExp }> = [
    { type: 'tpa', regex: /(?:\[TSL\]\s*)?(.+?)\s*请求传送到你的位置/ },
    { type: 'tpa', regex: /(?:\[TSL\]\s*)?(.+?)\s*has requested to teleport to you/i },
    { type: 'tpahere', regex: /(?:\[TSL\]\s*)?(.+?)\s*请求你传送到(?:他|她|它|其)?的位置/ },
    { type: 'tpahere', regex: /(?:\[TSL\]\s*)?(.+?)\s*has requested that you teleport to them/i }
  ]

  for (const { type, regex } of patterns) {
    const match = trimmed.match(regex)
    if (match) {
      const playerName = match[1].trim()
      if (playerName) return { playerName, type }
    }
  }
  return null
}
