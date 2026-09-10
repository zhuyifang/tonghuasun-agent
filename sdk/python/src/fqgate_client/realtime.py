from __future__ import annotations

import json
from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Any

from .discovery import ConnectionConfig, discover_connection
from .errors import RealtimeError


class RealtimeClient:
    def __init__(self, connection: ConnectionConfig) -> None:
        self.connection = connection

    @classmethod
    def discover(cls, config_path: str | None = None) -> "RealtimeClient":
        return cls(discover_connection(config_path))

    async def stream(self, commands: Sequence[Mapping[str, Any]]) -> AsyncIterator[dict[str, Any]]:
        try:
            import websockets
        except ImportError as error:
            raise RealtimeError(
                '实时订阅需要安装可选依赖：pip install "fqgate-client[realtime]"',
                code="missing_dependency",
            ) from error
        if not commands:
            raise ValueError("commands 不能为空。")

        async with websockets.connect(self.connection.websocket_url) as socket:
            for command in commands:
                await socket.send(json.dumps(dict(command), ensure_ascii=False))
            async for raw_message in socket:
                try:
                    message = json.loads(raw_message)
                except json.JSONDecodeError as error:
                    raise RealtimeError("FQGate 实时接口返回了无效 JSON。", code="invalid_response") from error
                if not isinstance(message, dict):
                    continue
                if message.get("event") == "notice" and int(message.get("code") or 0) != 0:
                    raise RealtimeError(
                        str(message.get("message") or "FQGate 实时订阅失败。"),
                        code=str(message.get("code") or "realtime_error"),
                    )
                yield message

    async def subscribe(
        self,
        *,
        kind: str,
        market: str,
        code: str,
        fields: Sequence[str | int] | None = None,
        money: int | float | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        command: dict[str, Any] = {"action": "subscribe", "kind": kind, "market": market, "code": code}
        if fields is not None:
            command["fields"] = list(fields)
        if money is not None:
            command["money"] = money
        async for message in self.stream([command]):
            yield message
