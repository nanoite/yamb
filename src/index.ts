import 'dotenv/config'
import { loadConfig, validateConfig, resolveDataPath } from './config/loader'
import { initDatabase, migrateFromJson, closeDatabase } from './platform/database'
import MessageQueue from './platform/message-queue'
import MinecraftBot from './platform/minecraft-bot'
import StandbyManager from './features/standby/manager'
import { startViewer, stopViewer } from './features/viewer'
import Whitelist from './permissions/whitelist'
import TeleportService from './features/teleport/service'
import TeleportIncomingHandler from './features/teleport/incoming-handler'
import PlayerInteractionService from './actions/player'
import MinecartInteractionService from './actions/minecart'
import RidingManager from './features/riding/manager'
import InventoryActions from './actions/inventory'
import ContainerRegistry from './features/container/registry'
import GameApiService from './api/game-service'
import SystemMessageBuffer from './features/commands/system-buffer'
import CommandHandler from './features/commands/handler'
import { registerChatListeners } from './features/commands/listeners'
import BrewModule from './features/brew'
import AstrbotServer from './api/server'
import { sleep } from './platform/sleep'
import { resumeBotPhysics } from './actions/shared/entity-utils'

async function main (): Promise<void> {
  const config = loadConfig()
  validateConfig(config)

  console.log('[Main] Starting mchatbot...')
  console.log(`[Main] AstrBot (QQ群): ${config.astrbot.enabled ? '已启用' : '已禁用'}`)
  console.log(`[Main] 管理员: ${config.adminList.length} 人`)
  console.log(`[Main] 游戏内命令前缀: ${config.command.prefix}`)
  console.log(`[Main] 交互距离: ${config.bot.interactionDistance} 格 / 接近距离: ${config.bot.approachDistance} 格`)
  console.log(`[Main] 公屏命令: ${config.command.allowPublicCommands ? '已启用' : '已禁用'}`)
  console.log(`[Main] 可视化 (viewer): ${config.viewer.enabled ? `已启用 :${config.viewer.port}` : '已禁用'}`)

  const dbPath = resolveDataPath(config.teleport.databaseFile)
  const db = initDatabase(dbPath)
  migrateFromJson(resolveDataPath('./data/whitelist.json'))

  const messageQueue = new MessageQueue(config.messageQueue)
  console.log('[Main] Message queue initialized')

  const whitelist = new Whitelist(db)
  const containerRegistry = new ContainerRegistry(db)
  console.log(`[Main] Whitelist loaded (${whitelist.count()} entries)`)
  console.log(`[Main] Containers loaded (${containerRegistry.count()} entries)`)

  const mcBot = new MinecraftBot(config.minecraft, config.command.whisperCommand)
  mcBot.setMessageQueue(messageQueue)

  const systemBuffer = new SystemMessageBuffer()
  const standbyManager = new StandbyManager(mcBot, config.bot)
  const teleportService = new TeleportService(mcBot, config.teleport)
  const playerInteraction = new PlayerInteractionService(
    mcBot,
    config.bot.interactionDistance,
    config.bot.approachDistance
  )
  const minecartInteraction = new MinecartInteractionService(
    mcBot,
    config.bot.interactionDistance,
    config.bot.approachDistance
  )
  const ridingManager = new RidingManager(mcBot, playerInteraction, config.bot)
  const isLocked = (): boolean => teleportService.isLocked()

  // 空闲 / 骑乘 / 锁定互斥：锁定前若在骑乘则先下马
  teleportService.setBeforeLock(async () => {
    if (!ridingManager.isActive()) return
    console.log('[Teleport] 锁定前下马（骑乘与锁定互斥）')
    await ridingManager.dismount()
    await sleep(400)
  })
  teleportService.setOnLock(() => standbyManager.scheduleAfk())
  teleportService.setOnUnlock(({ wasHover }) => {
    if (wasHover && mcBot.bot) {
      resumeBotPhysics(mcBot.bot)
    }
  })

  standbyManager.setRidingManager(ridingManager)
  standbyManager.setIsLocked(isLocked)
  ridingManager.setIsLocked(isLocked)
  ridingManager.setOnBehaviorEnd(() => standbyManager.scheduleAfk())
  const inventoryActions = new InventoryActions(mcBot)
  const gameApiService = new GameApiService(mcBot, whitelist, isLocked)
  const commandHandler = new CommandHandler(
    mcBot,
    teleportService,
    gameApiService,
    playerInteraction,
    minecartInteraction,
    ridingManager,
    containerRegistry,
    inventoryActions,
    systemBuffer,
    whitelist,
    standbyManager,
    config.command,
    config.bot,
    config.adminList
  )
  const teleportHandler = new TeleportIncomingHandler(
    teleportService,
    whitelist,
    mcBot,
    commandHandler.getCommandMessages(),
    standbyManager
  )

  mcBot.onSpawn(() => {
    registerChatListeners(mcBot, commandHandler, teleportHandler, systemBuffer)
    ridingManager.start()
    standbyManager.start()
    if (config.viewer.enabled && mcBot.bot) {
      startViewer(mcBot.bot, config.viewer)
    }
  })
  mcBot.create()
  console.log('[Main] Minecraft bot starting...')

  const brewModule = new BrewModule(mcBot, config.brew)
  brewModule.register()

  let apiServer: AstrbotServer | null = null
  if (config.astrbot.enabled) {
    apiServer = new AstrbotServer(config.astrbot, teleportService, gameApiService, whitelist)
    await apiServer.start()
    console.log('[Main] AstrBot API server started')
  } else {
    console.log('[Main] AstrBot API server skipped (disabled)')
  }

  process.on('SIGINT', () => {
    console.log('[Main] Shutting down...')
    stopViewer(mcBot.bot)
    ridingManager.stop()
    standbyManager.stop()
    apiServer?.stop()
    messageQueue.clear()
    closeDatabase()
    process.exit(0)
  })

  process.on('uncaughtException', (err) => {
    console.error('[Main] Uncaught exception:', err)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason)
    process.exit(1)
  })
}

main().catch(err => {
  console.error('[Main] Fatal error:', err)
  process.exit(1)
})
