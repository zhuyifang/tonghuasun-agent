from __future__ import annotations

from typing import Any


class FQGateError(RuntimeError):
    """SDK 基础异常。"""


class ConfigurationError(FQGateError):
    """FQGate 本机地址或共享配置无效。"""


class ApiError(FQGateError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "api_error",
        status: int | None = None,
        request_id: str = "",
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.request_id = request_id
        self.details = details


class RealtimeError(FQGateError):
    def __init__(self, message: str, *, code: str = "realtime_error") -> None:
        super().__init__(message)
        self.code = code
