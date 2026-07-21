import type { Bot } from 'mineflayer'
import type { ViewerConfig } from '../../types'

type BotWithViewer = Bot & {
  viewer?: { close?: () => void }
}

function ensureViewerDeps (): boolean {
  try {
    require.resolve('canvas')
    require.resolve('prismarine-viewer')
    return true
  } catch (err) {
    const msg = (err as NodeJS.ErrnoException).message || ''
    if (msg.includes('canvas')) {
      console.error('[Viewer] 缺少依赖 canvas，请运行: yarn add canvas')
      console.error('[Viewer] Windows 若安装失败，需安装 Visual Studio Build Tools 或使用预编译版本')
    } else {
      console.error('[Viewer] 缺少依赖 prismarine-viewer，请运行: yarn add prismarine-viewer canvas')
    }
    return false
  }
}


export function startViewer (bot: Bot, config: ViewerConfig): void {
  if (!config.enabled) return
  if (!ensureViewerDeps()) return

  try {
    const { mineflayer: mineflayerViewer } = require('prismarine-viewer') as {
      mineflayer: (bot: Bot, options: Record<string, unknown>) => void
    }

    mineflayerViewer(bot, {
      port: config.port,
      firstPerson: config.firstPerson,
      viewDistance: config.viewDistance
    })

    console.log(`[Viewer] 已启动，浏览器打开 http://localhost:${config.port}`)
  } catch (err) {
    console.error('[Viewer] 启动失败:', (err as Error).message)
  }
}

export function stopViewer (bot: Bot | null): void {
  if (!bot) return
  try {
    (bot as BotWithViewer).viewer?.close?.()
  } catch {
  }
}
