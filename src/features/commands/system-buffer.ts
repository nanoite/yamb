export default class SystemMessageBuffer {
  private messages: Array<{ text: string; time: number }> = []
  private readonly retentionMs: number

  constructor (retentionMs = 10000) {
    this.retentionMs = retentionMs
  }

  push (text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return

    const now = Date.now()
    this.messages.push({ text: trimmed, time: now })
    this.prune(now)
  }

  collect (sinceMs: number, windowMs: number): string[] {
    const until = sinceMs + windowMs
    this.prune(until)
    return this.messages
      .filter(m => m.time >= sinceMs && m.time <= until)
      .map(m => m.text)
  }

  private prune (now: number): void {
    this.messages = this.messages.filter(m => now - m.time <= this.retentionMs)
  }
}
