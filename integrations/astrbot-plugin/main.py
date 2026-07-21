"""Minecraft传送机器人插件

命令：
- /ybot tp <游戏名> — 向指定玩家发送传送请求
- /ybot add <游戏名> — 添加白名单（管理员）
- /ybot remove <游戏名> — 移除白名单（管理员）
- /ybot list — 查看白名单
- /ybot status — 查看机器人状态
- /ybot players — 查看在线玩家
- /ybot say <消息> — 发送公屏消息（管理员）
- /ybot help — 显示帮助
"""

import httpx
from astrbot.api.event import filter, AstrMessageEvent
from astrbot.api.star import Context, Star
from astrbot.api import logger
from astrbot.api import AstrBotConfig


# ── /ybot — 命令组（必须在类外部定义）──
@filter.command_group("ybot")
def ybot():
    """Minecraft传送机器人命令"""
    pass


class Plugin(Star):
    def __init__(self, context: Context, config: AstrBotConfig):
        super().__init__(context)
        self.config = config
        self.api_url = config.get("mchatbot_api_url", "http://localhost:15100").rstrip("/")
        self.api_key = config.get("mchatbot_api_key", "")
        raw = config.get("admin_qq_list", "")
        self.admin_list = {q.strip() for q in raw.split(",") if q.strip()} if raw else set()

    def _headers(self):
        return {"X-API-Key": self.api_key}

    def _is_admin(self, event: AstrMessageEvent) -> bool:
        sender_id = event.get_sender_id()
        return sender_id in self.admin_list

    async def _api_get(self, path):
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{self.api_url}{path}", headers=self._headers())
            resp.raise_for_status()
            return resp.json()

    async def _api_post(self, path, data):
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{self.api_url}{path}", headers=self._headers(), json=data)
            resp.raise_for_status()
            return resp.json()

    @ybot.command("tp")
    async def tp(self, event: AstrMessageEvent, game_name: str):
        """接受玩家传送请求 /ybot tp <游戏名>"""
        if not self.api_key:
            yield event.plain_result("⚠️ 插件未配置 API Key，请联系管理员。")
            return

        try:
            data = await self._api_post("/api/tp/accept", {"game_name": game_name})
            if data.get("success"):
                yield event.plain_result(f"✅ {data.get('message', '已发送传送请求')}")
            else:
                yield event.plain_result(f"❌ {data.get('message', '传送失败')}")
        except httpx.TimeoutException:
            yield event.plain_result("❌ 请求超时，请稍后再试。")
        except Exception as e:
            logger.error(f"传送请求异常: {e}")
            yield event.plain_result("❌ 发生错误，请稍后再试。")

    @ybot.command("add")
    async def add_whitelist(self, event: AstrMessageEvent, game_name: str):
        """添加白名单 /ybot add <游戏名>"""
        if not self._is_admin(event):
            yield event.plain_result("❌ 你没有权限执行此命令。")
            return

        if not self.api_key:
            yield event.plain_result("⚠️ 插件未配置 API Key，请联系管理员。")
            return

        try:
            sender_id = event.get_sender_id()
            data = await self._api_post("/api/whitelist/add", {
                "game_name": game_name,
                "added_by": sender_id
            })
            if data.get("success"):
                yield event.plain_result(f"✅ {data.get('message', '已添加白名单')}")
            else:
                yield event.plain_result(f"❌ {data.get('message', '添加失败')}")
        except httpx.TimeoutException:
            yield event.plain_result("❌ 请求超时，请稍后再试。")
        except Exception as e:
            logger.error(f"添加白名单异常: {e}")
            yield event.plain_result("❌ 发生错误，请稍后再试。")

    @ybot.command("remove")
    async def remove_whitelist(self, event: AstrMessageEvent, game_name: str):
        """移除白名单 /ybot remove <游戏名>"""
        if not self._is_admin(event):
            yield event.plain_result("❌ 你没有权限执行此命令。")
            return

        if not self.api_key:
            yield event.plain_result("⚠️ 插件未配置 API Key，请联系管理员。")
            return

        try:
            data = await self._api_post("/api/whitelist/remove", {"game_name": game_name})
            if data.get("success"):
                yield event.plain_result(f"✅ {data.get('message', '已移除白名单')}")
            else:
                yield event.plain_result(f"❌ {data.get('message', '移除失败')}")
        except httpx.TimeoutException:
            yield event.plain_result("❌ 请求超时，请稍后再试。")
        except Exception as e:
            logger.error(f"移除白名单异常: {e}")
            yield event.plain_result("❌ 发生错误，请稍后再试。")

    @ybot.command("list")
    async def list_whitelist(self, event: AstrMessageEvent):
        """查看白名单 /ybot list"""
        if not self.api_key:
            yield event.plain_result("⚠️ 插件未配置 API Key，请联系管理员。")
            return

        try:
            data = await self._api_get("/api/whitelist/list")
            if data.get("success"):
                whitelist = data.get("whitelist", {})
                count = data.get("count", 0)
                if not whitelist:
                    yield event.plain_result("📋 白名单为空")
                    return

                lines = [f"📋 白名单列表 (共 {count} 人)", "━━━━━━━━━━━━━━━━"]
                for game_name, info in whitelist.items():
                    added_at = info.get("addedAt", "未知时间")[:10] if isinstance(info, dict) else "未知"
                    lines.append(f"• {game_name} (添加于 {added_at})")
                yield event.plain_result("\n".join(lines))
            else:
                yield event.plain_result("❌ 获取白名单失败")
        except httpx.TimeoutException:
            yield event.plain_result("❌ 请求超时，请稍后再试。")
        except Exception as e:
            logger.error(f"获取白名单异常: {e}")
            yield event.plain_result("❌ 发生错误，请稍后再试。")

    @ybot.command("status")
    async def status(self, event: AstrMessageEvent):
        """查看机器人状态 /ybot status"""
        if not self.api_key:
            yield event.plain_result("⚠️ 插件未配置 API Key，请联系管理员。")
            return

        try:
            data = await self._api_get("/api/status")
            if data.get("success"):
                mc_status = "✅ 在线" if data.get("minecraft") else "❌ 离线"
                username = data.get("username", "未知")
                uptime = int(data.get("uptime", 0))
                whitelist_count = data.get("whitelist_count", 0)

                hours = uptime // 3600
                minutes = (uptime % 3600) // 60

                lines = [
                    "🎮 Minecraft机器人状态",
                    "━━━━━━━━━━━━━━━━",
                    f"状态: {mc_status}",
                    f"账号: {username}",
                    f"运行时间: {hours}小时{minutes}分钟",
                    f"白名单人数: {whitelist_count}"
                ]
                yield event.plain_result("\n".join(lines))
            else:
                yield event.plain_result("❌ 获取状态失败")
        except httpx.TimeoutException:
            yield event.plain_result("❌ 请求超时，请稍后再试。")
        except Exception as e:
            logger.error(f"获取状态异常: {e}")
            yield event.plain_result("❌ 发生错误，请稍后再试。")

    @ybot.command("players")
    async def players(self, event: AstrMessageEvent):
        """查看在线玩家 /ybot players"""
        if not self.api_key:
            yield event.plain_result("⚠️ 插件未配置 API Key，请联系管理员。")
            return

        try:
            data = await self._api_get("/api/players")
            if data.get("success"):
                player_list = data.get("players", [])
                count = data.get("count", 0)
                if not player_list:
                    yield event.plain_result("👥 当前无在线玩家")
                    return

                lines = [f"👥 在线玩家 (共 {count} 人)", "━━━━━━━━━━━━━━━━"]
                for player in player_list:
                    lines.append(f"• {player}")
                yield event.plain_result("\n".join(lines))
            else:
                yield event.plain_result(f"❌ {data.get('message', '获取玩家列表失败')}")
        except httpx.TimeoutException:
            yield event.plain_result("❌ 请求超时，请稍后再试。")
        except Exception as e:
            logger.error(f"获取玩家列表异常: {e}")
            yield event.plain_result("❌ 发生错误，请稍后再试。")

    @ybot.command("say")
    async def say(self, event: AstrMessageEvent):
        """发送公屏消息 /ybot say <消息>"""
        if not self._is_admin(event):
            yield event.plain_result("❌ 你没有权限执行此命令。")
            return

        if not self.api_key:
            yield event.plain_result("⚠️ 插件未配置 API Key，请联系管理员。")
            return

        message = event.message_str.removeprefix("/ybot say").removeprefix("ybot say").strip()
        if not message:
            yield event.plain_result("❌ 请指定要发送的消息。")
            return

        try:
            data = await self._api_post("/api/say", {"message": message})
            if data.get("success"):
                yield event.plain_result(f"✅ {data.get('message', '已发送消息')}")
            else:
                yield event.plain_result(f"❌ {data.get('message', '发送失败')}")
        except httpx.TimeoutException:
            yield event.plain_result("❌ 请求超时，请稍后再试。")
        except Exception as e:
            logger.error(f"发送消息异常: {e}")
            yield event.plain_result("❌ 发生错误，请稍后再试。")

    @ybot.command("help", alias={"帮助"})
    async def show_help(self, event: AstrMessageEvent):
        """显示帮助信息 /ybot help"""
        lines = [
            "🎮 Minecraft传送机器人帮助",
            "━━━━━━━━━━━━━━━━",
            "",
            "📡 /ybot tp <游戏名>",
            "   向指定玩家发送传送请求",
            "",
            "➕ /ybot add <游戏名>",
            "   添加白名单（管理员）",
            "",
            "➖ /ybot remove <游戏名>",
            "   移除白名单（管理员）",
            "",
            "📋 /ybot list",
            "   查看白名单",
            "",
            "📊 /ybot status",
            "   查看机器人状态",
            "",
            "👥 /ybot players",
            "   查看在线玩家",
            "",
            "💬 /ybot say <消息>",
            "   发送公屏消息（管理员）",
            "",
            "❓ /ybot help",
            "   显示本帮助",
        ]
        yield event.plain_result("\n".join(lines))

    async def terminate(self):
        """插件卸载时调用"""
        pass
