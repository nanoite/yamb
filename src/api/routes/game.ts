import { Router, Request, Response } from 'express'
import type GameApiService from '../game-service'

export default function createGameRoutes (gameApiService: GameApiService): Router {
  const router = Router()

  router.get('/status', (_req: Request, res: Response) => {
    res.json(gameApiService.getStatus())
  })

  router.get('/players', (_req: Request, res: Response) => {
    const result = gameApiService.getPlayers()
    res.json(result)
  })

  router.post('/say', (req: Request, res: Response) => {
    const { message } = req.body as { message?: string }
    if (!message) {
      return res.status(400).json({ success: false, message: 'Missing message' })
    }

    const result = gameApiService.say(message)
    res.json(result)
  })

  return router
}
