import { Router, Request, Response } from 'express'
import type TeleportService from '../../features/teleport/service'
import type Whitelist from '../../permissions/whitelist'

export default function createTeleportRoutes (
  teleportService: TeleportService,
  whitelist: Whitelist
): Router {
  const router = Router()

  router.post('/tp/accept', async (req: Request, res: Response) => {
    const { game_name } = req.body as { game_name?: string }
    if (!game_name) {
      return res.status(400).json({ success: false, message: 'Missing game_name' })
    }
    if (!whitelist.isAllowed(game_name)) {
      return res.json({ success: false, message: `${game_name} 不在白名单中` })
    }

    const result = await teleportService.acceptRequest(game_name, 'tpa')
    res.json(result)
  })

  router.post('/home', async (req: Request, res: Response) => {
    const { game_name, waypoint } = req.body as { game_name?: string; waypoint?: string }
    if (!game_name || !waypoint) {
      return res.status(400).json({ success: false, message: 'Missing game_name or waypoint' })
    }
    if (!whitelist.isAllowed(game_name)) {
      return res.json({ success: false, message: `${game_name} 不在白名单中` })
    }

    const result = await teleportService.goToPlayerViaWaypoint(game_name, waypoint)
    res.json(result)
  })

  router.post('/lock', async (req: Request, res: Response) => {
    const { game_name } = req.body as { game_name?: string }
    if (!game_name) {
      return res.status(400).json({ success: false, message: 'Missing game_name' })
    }
    if (!whitelist.isAllowed(game_name)) {
      return res.json({ success: false, message: `${game_name} 不在白名单中` })
    }

    await teleportService.prepareAndLock(game_name)
    res.json({ success: true, message: '已锁定' })
  })

  router.post('/unlock', (req: Request, res: Response) => {
    const { game_name } = req.body as { game_name?: string }
    if (!game_name) {
      return res.status(400).json({ success: false, message: 'Missing game_name' })
    }
    if (!whitelist.isAllowed(game_name)) {
      return res.json({ success: false, message: `${game_name} 不在白名单中` })
    }

    teleportService.unlock()
    res.json({ success: true, message: '已解锁' })
  })

  router.post('/whitelist/add', (req: Request, res: Response) => {
    const { game_name, added_by } = req.body as { game_name?: string; added_by?: string }
    if (!game_name) {
      return res.status(400).json({ success: false, message: 'Missing game_name' })
    }

    if (whitelist.isAllowed(game_name)) {
      return res.json({ success: false, message: `${game_name} 已在白名单中` })
    }

    whitelist.add(game_name, added_by)
    res.json({ success: true, message: `已添加白名单: ${game_name}` })
  })

  router.post('/whitelist/remove', (req: Request, res: Response) => {
    const { game_name } = req.body as { game_name?: string }
    if (!game_name) {
      return res.status(400).json({ success: false, message: 'Missing game_name' })
    }

    if (!whitelist.isAllowed(game_name)) {
      return res.json({ success: false, message: `${game_name} 不在白名单中` })
    }

    whitelist.remove(game_name)
    res.json({ success: true, message: `已移除白名单: ${game_name}` })
  })

  router.get('/whitelist/list', (_req: Request, res: Response) => {
    const list = whitelist.list()
    res.json({ success: true, whitelist: list, count: whitelist.count() })
  })

  router.get('/whitelist/check/:game_name', (req: Request, res: Response) => {
    const { game_name } = req.params
    const allowed = whitelist.isAllowed(game_name)
    const info = whitelist.get(game_name)
    res.json({ success: true, allowed, info })
  })

  return router
}
