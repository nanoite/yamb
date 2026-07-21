interface TextField {
  value?: string
}

interface ChatComponentObject {
  text?: string | TextField
  translate?: string | TextField
  extra?: ChatComponent | ChatComponent[]
  with?: ChatComponent | ChatComponent[]
}

type ChatComponent = string | ChatComponent[] | ChatComponentObject

function isObject (value: ChatComponent): value is ChatComponentObject {
  return typeof value === 'object' && !Array.isArray(value)
}

export function componentToText (component: ChatComponent | null | undefined): string {
  if (!component) return ''
  if (typeof component === 'string') {
    try {
      return componentToText(JSON.parse(component) as ChatComponent)
    } catch {
      return component
    }
  }
  if (Array.isArray(component)) {
    return component.map(part => componentToText(part)).join('')
  }
  if (!isObject(component)) return String(component)

  let text = ''

  if (component.text) {
    if (typeof component.text === 'string') text += component.text
    else if (component.text.value) text += component.text.value
  }

  if (component.translate) {
    if (typeof component.translate === 'string') text += component.translate
    else if (component.translate.value) text += component.translate.value
  }

  if (component.extra) {
    const extra = Array.isArray(component.extra) ? component.extra : [component.extra]
    text += extra.map(part => componentToText(part)).join('')
  }

  if (component.with) {
    const withArr = Array.isArray(component.with) ? component.with : [component.with]
    text += withArr.map(part => componentToText(part)).join('')
  }

  return text
}

export function usernameFromUuid (bot: { players?: Record<string, { uuid?: string }> }, uuid: string): string | null {
  if (!uuid || !bot) return null
  const normalized = String(uuid).toLowerCase()
  for (const [username, player] of Object.entries(bot.players || {})) {
    if (String(player.uuid || '').toLowerCase() === normalized) return username
  }
  return null
}
