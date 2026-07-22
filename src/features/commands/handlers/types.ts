import type { CommandSource } from '../parser'
import type MinecraftBot from '../../../platform/minecraft-bot'
import type GameApiService from '../../../api/game-service'
import type TeleportService from '../../teleport/service'
import type Whitelist from '../../../permissions/whitelist'
import type StandbyManager from '../../standby/manager'
import type PlayerInteractionService from '../../../actions/player'
import type MinecartInteractionService from '../../../actions/minecart'
import type RidingManager from '../../riding/manager'
import type ContainerRegistry from '../../container/registry'
import type InventoryActions from '../../../actions/inventory'
import type SystemMessageBuffer from '../system-buffer'
import type CommandMessages from '../messages'

export interface CommandContext {
  mcBot: MinecraftBot
  teleportService: TeleportService
  gameApiService: GameApiService
  playerInteraction: PlayerInteractionService
  minecartInteraction: MinecartInteractionService
  ridingManager: RidingManager
  containerRegistry: ContainerRegistry
  inventoryActions: InventoryActions
  systemBuffer: SystemMessageBuffer
  whitelist: Whitelist
  standby: StandbyManager
  messages: CommandMessages
  interactionDistance: number
  approachDistance: number
  forwardWaitMs: number
  reply: (username: string, message: string, source: CommandSource) => Promise<void>
  isAdmin: (username: string) => boolean
  waypointHint: () => string
  notifyLocked: (username: string, source: CommandSource) => Promise<void>
}
