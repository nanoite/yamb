import type { MessagesConfig } from '../../types'

type MessageVars = Record<string, string | number>

export default class CommandMessages {
  private templates: MessagesConfig
  private prefix: string

  constructor (messages: MessagesConfig, prefix: string) {
    this.templates = messages
    this.prefix = prefix
  }

  text (key: keyof MessagesConfig, vars: MessageVars = {}): string {
    const template = this.templates[key]
    if (typeof template !== 'string') return ''
    return this.interpolate(template, vars)
  }

  lines (key: keyof MessagesConfig, vars: MessageVars = {}): string[] {
    const template = this.templates[key]
    if (Array.isArray(template)) {
      return template.map(line => this.interpolate(line, vars))
    }
    if (typeof template === 'string') {
      return [this.interpolate(template, vars)]
    }
    return []
  }

  private interpolate (template: string, vars: MessageVars): string {
    const allVars: MessageVars = { prefix: this.prefix, ...vars }
    return template.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = allVars[name]
      return value !== undefined ? String(value) : `{${name}}`
    })
  }
}
