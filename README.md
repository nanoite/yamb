# yamb

**Yet Another MChatBot** — 基于 [Mineflayer](https://github.com/PrismarineJS/mineflayer) 的 Minecraft 游戏内机器人。

支持私聊/公屏命令、传送与白名单、玩家交互（骑乘/攻击/上车）、容器登记与存取、背包管理、待命与 AFK、可选网页 Viewer，以及 AstrBot HTTP API 集成。

## 功能概览

- **命令渠道**：私聊无前缀；公屏需配置前缀（默认见 `command.json`）
- **权限**：SQLite 白名单 + `.env` 管理员列表
- **传送**：自动接受白名单 `/tpa`、`/tpahere`；`phome` 经传送点拉人；锁定模式
- **交互**：骑乘玩家（可切换目标、非主动脱离自动重骑）、矿车上车、攻击
- **物品**：容器登记、`store`/`take` 存取、`drop` 丢弃、管理员 `inv` 查背包
- **待命**：超时自动 `/home`、吃金胡萝卜、`/afk`
- **Viewer**：可选 `prismarine-viewer` 网页可视化（需 `canvas`）
- **酿造**：占位模块，待实现

## 目录结构

```
yamb/
├── src/
│   ├── index.ts                 # 启动与模块组装
│   ├── config/loader.ts         # 加载 .env 与 config/game/*
│   ├── types/
│   ├── platform/                # Mineflayer 封装、数据库、消息队列
│   ├── permissions/             # 白名单
│   ├── actions/                 # 原子动作（玩家交互、矿车、背包/容器）
│   ├── features/                # 业务模块
│   │   ├── commands/            # 命令流程（解析 → 鉴权 → 调度）
│   │   ├── teleport/
│   │   ├── container/
│   │   ├── riding/              # 骑乘状态与重骑
│   │   ├── standby/
│   │   ├── viewer/
│   │   └── brew/                # 占位
│   └── api/                     # AstrBot HTTP API
├── integrations/
│   └── astrbot-plugin/          # AstrBot Python 插件
├── config/game/                 # 游戏内配置（支持 // 注释）
└── data/                        # 运行时 SQLite（gitignore）
```

**设计原则**

- `actions/`：单个游戏动作，可复用
- `features/commands/`：完整指令流程
- `config/game/messages.json`：命令回复文案

## 安装

```bash
yarn install
cp .env.example .env
# 编辑 .env 与 config/game/
yarn start
```

开发模式（免编译）：

```bash
yarn dev
```

## 配置

| 层级 | 位置 | 内容 |
|------|------|------|
| 部署/账号 | `.env` | MC 账号、服务器、`MC_ADMIN_LIST`、API 密钥 |
| 游戏行为 | `config/game/*.json` | 前缀、待命、传送点、交互距离、viewer 等 |

详见 [config/game/README.md](config/game/README.md)。

### Viewer

启用 viewer 需安装原生模块：

```bash
yarn add canvas
```

在 `config/game/viewer.json` 中设置 `"enabled": true`，启动后访问 `http://localhost:3007`（端口可配置）。

## 游戏内命令

私聊无需前缀；公屏需 `{prefix}`（见 `config/game/command.json`）。`allowPublicCommands` 为 `false` 时仅私聊可用。

### 白名单

| 命令 | 说明 |
|------|------|
| `help` | 帮助 |
| `status` | 状态（空闲/骑乘/矿车/锁定）、运行时长、当前坐标 |
| `phome <别名>` | 经传送点拉取玩家 |
| `mount [玩家]` | 骑乘目标（可切换；非主动脱离会尝试重骑） |
| `unmount` | 主动下马 |
| `cart` | 登上最近矿车 |
| `attack [玩家]` | 攻击目标 |
| `lock` / `unlock` | 锁定/解锁传送（锁定后仅接受 `/tpa`） |
| `store <容器> <物品> [数量]` | 存入已登记容器 |
| `take <容器> <物品> [数量]` | 从容器取出 |
| `drop <物品> [数量]` | 丢弃背包物品 |
| `container list` / `info` | 查看已登记容器 |

白名单玩家对 bot 发送 `/tpa` 或 `/tpahere` 时 bot 会自动接受（无回复）。

### 管理员

| 命令 | 说明 |
|------|------|
| `inv` | 查看 bot 背包 |
| `container add <别名>` | 登记容器（需对准方块） |
| `container remove <别名>` | 删除容器记录 |
| `add <游戏名>` / `remove <游戏名>` | 白名单管理 |
| `say <消息>` | 发送公屏消息 |
| `forward <消息>` | 发公屏并转发随后系统消息 |

## AstrBot 集成（可选）

1. 在 `.env` 设置 `ASTRBOT_ENABLED=true` 与 `API_KEY`
2. 将 `integrations/astrbot-plugin/` 安装到 AstrBot
3. 配置插件中的 API 地址与密钥

HTTP 路由见 `src/api/routes/`。

## 许可证

本项目采用 [GNU General Public License v3.0](https://www.gnu.org/licenses/gpl-3.0.html)（GPL-3.0）。

基于 GPL 发布：你可以自由使用、修改和分发本软件；若分发修改后的版本，须以相同许可证公开源代码。
