from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from .errors import ConfigurationError

DEFAULT_MCP_URL = "http://127.0.0.1:17281/mcp"


@dataclass(frozen=True, slots=True)
class ConnectionConfig:
    base_url: str
    mcp_url: str
    config_path: Path | None = None
    fqgate_version: str = ""

    @property
    def websocket_url(self) -> str:
        return "ws://" + self.base_url.removeprefix("http://").rstrip("/") + "/v1/market/stream"


def discover_connection(config_path: str | os.PathLike[str] | None = None) -> ConnectionConfig:
    resolved_path = Path(config_path).expanduser().resolve() if config_path else _default_config_path()
    config = _read_config(resolved_path)
    mcp_url = os.environ.get("FQGATE_MCP_URL", "").strip() or str(config.get("mcpUrl") or DEFAULT_MCP_URL)
    normalized = _validate_mcp_url(mcp_url)
    parsed = urlparse(normalized)
    base_url = f"http://{parsed.netloc}"
    return ConnectionConfig(
        base_url=base_url,
        mcp_url=normalized,
        config_path=resolved_path if resolved_path.exists() else None,
        fqgate_version=str(config.get("fqgateVersion") or ""),
    )


def _default_config_path() -> Path:
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        if not local_app_data:
            raise ConfigurationError("LOCALAPPDATA 不可用，无法定位 fqgate-agent 连接配置。")
        return (Path(local_app_data) / "fqgate" / "agent-plugin.json").resolve()
    return (Path.home() / "Library" / "Application Support" / "fqgate" / "agent-plugin.json").resolve()


def _read_config(path: Path) -> dict[str, object]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigurationError(f"无法读取 fqgate-agent 连接配置：{path}：{error}") from error
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise ConfigurationError(f"fqgate-agent 连接配置格式无效：{path}")
    return value


def _validate_mcp_url(value: str) -> str:
    parsed = urlparse(value)
    if (
        parsed.scheme != "http"
        or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
        or parsed.path != "/mcp"
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ConfigurationError("FQGate MCP 只允许使用不含凭据和查询参数的本机 http://.../mcp 地址。")
    return value.rstrip("/")
