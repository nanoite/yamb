declare module 'mineflayer-pathfinder' {
  import type { Bot } from 'mineflayer'

  export class Movements {
    constructor (bot: Bot)
    canDig?: boolean
    allow1by1towers?: boolean
  }

  export namespace goals {
    class GoalNear {
      constructor (x: number, y: number, z: number, range: number)
    }
  }

  export function pathfinder (bot: Bot): void
}
