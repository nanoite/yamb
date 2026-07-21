import express, { Express } from 'express'
import { Server } from 'http'
import type { AstrbotConfig } from '../types'
import createTeleportRoutes from './routes/teleport'
import createGameRoutes from './routes/game'
import type TeleportService from '../features/teleport/service'
import type GameApiService from './game-service'
import type Whitelist from '../permissions/whitelist'

export default class AstrbotServer {
  private config: AstrbotConfig
  private app: Express
  private server: Server | null = null

  constructor (
    config: AstrbotConfig,
    teleportService: TeleportService,
    gameApiService: GameApiService,
    whitelist: Whitelist
  ) {
    this.config = config
    this.app = express()
    this.app.use(express.json())
    this._setupAuth()
    this._setupRoutes(teleportService, gameApiService, whitelist)
  }

  private _setupAuth (): void {
    this.app.use((req, res, next) => {
      const apiKey = req.headers['x-api-key']
      if (apiKey !== this.config.apiKey) {
        return res.status(401).json({ success: false, message: 'Unauthorized' })
      }
      next()
    })
  }

  private _setupRoutes (
    teleportService: TeleportService,
    gameApiService: GameApiService,
    whitelist: Whitelist
  ): void {
    this.app.use('/api', createTeleportRoutes(teleportService, whitelist))
    this.app.use('/api', createGameRoutes(gameApiService))
  }

  start (): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`[AstrBot] API server listening on port ${this.config.port}`)
        resolve()
      })
    })
  }

  stop (): void {
    if (this.server) {
      this.server.close()
    }
  }
}
