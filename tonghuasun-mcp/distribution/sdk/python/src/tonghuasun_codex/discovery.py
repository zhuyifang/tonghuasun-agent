from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .errors import ConfigurationError


@dataclass(frozen=True, slots=True)
class ConnectionConfig:
    base_url: str
    access_token: str
    product_home: Path
    plugin_version: str = ""
    process_id: int | None = None

    @property
    def websocket_url(self) -> str:
        if self.base_url.startswith("https://"):
            base = "wss://" + self.base_url.removeprefix("https://")
        elif self.base_url.startswith("http://"):
            base = "ws://" + self.base_url.removeprefix("http://")
        else:
            raise ConfigurationError(f"无法转换为 WebSocket 地址：{self.base_url}")
        return base.rstrip("/") + "/api/v2/realtime/ws"


def discover_connection(product_home: str | os.PathLike[str] | None = None) -> ConnectionConfig:
    home = _resolve_product_home(product_home)
    config = _read_json(home / "config.json", required=True)
    endpoint = _read_json(home / "runtime" / "endpoint.json", required=False)

    base_url = str(endpoint.get("baseUrl") or "").strip()
    if not base_url:
        port = _read_port(config.get("preferredPort"), 17180)
        base_url = f"http://127.0.0.1:{port}"

    access_token = str(config.get("localAccessToken") or "").strip()
    if not access_token:
        raise ConfigurationError(f"本地配置缺少 localAccessToken：{home / 'config.json'}")

    process_id = endpoint.get("processId")
    return ConnectionConfig(
        base_url=base_url.rstrip("/"),
        access_token=access_token,
        product_home=home,
        plugin_version=str(endpoint.get("pluginVersion") or ""),
        process_id=process_id if isinstance(process_id, int) else None,
    )


def _resolve_product_home(product_home: str | os.PathLike[str] | None) -> Path:
    if product_home is not None:
        return Path(product_home).expanduser().resolve()

    overridden = (
        os.environ.get("TONGHUASUN_AGENT_HOME", "").strip()
        or os.environ.get("TONGHUASUN_CODEX_HOME", "").strip()
    )
    if overridden:
        return Path(os.path.expandvars(overridden)).expanduser().resolve()

    local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
    if not local_app_data:
        raise ConfigurationError("LOCALAPPDATA 不可用，无法发现同花顺 Codex 本地配置。")
    return (Path(local_app_data) / "TonghuasunCodex").resolve()


def _read_json(path: Path, *, required: bool) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        if required:
            raise ConfigurationError(f"未找到同花顺 Codex 配置：{path}") from None
        return {}
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(f"无法读取同花顺 Codex 配置：{path}：{error}") from error

    if not isinstance(value, dict):
        raise ConfigurationError(f"同花顺 Codex 配置必须是 JSON 对象：{path}")
    return value


def _read_port(value: Any, fallback: int) -> int:
    return value if isinstance(value, int) and 1_024 <= value <= 65_535 else fallback
