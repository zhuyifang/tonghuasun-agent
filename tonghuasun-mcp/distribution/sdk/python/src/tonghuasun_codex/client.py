from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Iterable, Literal, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .discovery import ConnectionConfig, discover_connection
from .errors import ApiError

Market = Literal[1, 2, 3]
Level2Mode = Literal["orders", "trades", "cancels"]
CandleAdjustment = Literal[0, 1, 2]

DEFAULT_SNAPSHOT_FIELDS = (
    "full_code",
    "security_name",
    "latest",
    "prev_close",
    "open",
    "high",
    "low",
    "rise_amount",
    "rise_percentage",
    "transaction_volume",
    "transaction_amount",
    "date_time",
)
DEFAULT_CANDLE_FIELDS = (
    "full_code",
    "security_name",
    "open",
    "high",
    "low",
    "latest",
    "transaction_volume",
    "transaction_amount",
    "date_time",
)
DEFAULT_TICK_FIELDS = (
    "full_code",
    "security_name",
    "latest",
    "price",
    "volume",
    "amount",
    "date_time",
    "volclass",
    "raw_side",
    "side",
    "buy_in",
)
DEFAULT_TREND_FIELDS = (
    "full_code",
    "security_name",
    "latest",
    "transaction_volume",
    "transaction_amount",
    "date_time",
)
DEFAULT_AUCTION_FIELDS = (
    "full_code",
    "security_name",
    "indicative_price",
    "matched_volume",
    "unmatched_bid_volume",
    "unmatched_ask_volume",
    "date_time",
)

DEFAULT_LEVEL2_FIELDS: dict[Level2Mode, tuple[str, ...]] = {
    "orders": (
        "orderNo",
        "orderId",
        "price",
        "volume",
        "amount",
        "time",
        "requestTime",
        "tradeTime",
        "side",
        "volclass",
        "buy_in",
    ),
    "trades": (
        "full_code",
        "price",
        "volume",
        "amount",
        "transaction_volume",
        "date_time",
        "volclass",
        "raw_side",
        "side",
        "transaction_count",
        "buy_order_no",
        "sell_order_no",
        "source_tick_id",
        "sequence_no",
    ),
    "cancels": (
        "price",
        "volume",
        "cancelTime",
        "requestTime",
        "orderNo",
        "orderId",
        "amount",
        "side",
        "raw_side",
        "volclass",
    ),
}


class Client:
    def __init__(self, connection: ConnectionConfig, *, timeout: float = 30.0) -> None:
        self.connection = connection
        self.timeout = timeout

    @classmethod
    def discover(
        cls,
        product_home: str | None = None,
        *,
        timeout: float = 30.0,
    ) -> "Client":
        return cls(discover_connection(product_home), timeout=timeout)

    def request(
        self,
        method: str,
        path: str,
        payload: Mapping[str, Any] | None = None,
        *,
        unwrap: bool = True,
    ) -> Any:
        body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = Request(
            self.connection.base_url + "/" + path.lstrip("/"),
            data=body,
            method=method.upper(),
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Tonghuasun-Codex-Token": self.connection.access_token,
                "User-Agent": "tonghuasun-codex-python/0.1.0",
            },
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                status = response.status
                raw = response.read()
        except HTTPError as error:
            raw = error.read()
            self._raise_api_error(raw, status=error.code, fallback=str(error))
        except URLError as error:
            raise ApiError(
                f"无法连接本机同花顺插件：{error.reason}",
                code="connection_error",
            ) from error

        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ApiError(
                "同花顺插件返回了无法解析的 JSON。",
                code="invalid_response",
                status=status,
            ) from error

        if not isinstance(value, dict):
            return value
        if value.get("ok") is False:
            self._raise_envelope_error(value, status=status)
        return value.get("data") if unwrap and "data" in value else value

    def health(self) -> dict[str, Any]:
        return self.request("GET", "/health")

    def catalog(self) -> dict[str, Any]:
        return self.request("GET", "/catalog")

    def search(self, query: str, *, market: Market = 1, limit: int = 20) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/securities/search",
            {"query": query, "market": market, "limit": limit},
        )

    def snapshot(
        self,
        codes: str | Sequence[str],
        *,
        market: Market = 1,
        fields: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/quotes/snapshot",
            {
                "market": market,
                "codes": _codes(codes),
                "fields": _field_list(fields, DEFAULT_SNAPSHOT_FIELDS),
            },
        )

    def candles(
        self,
        code: str,
        *,
        market: Market = 1,
        period: int = 7,
        adjustment: CandleAdjustment = 0,
        limit: int = 200,
        fields: Sequence[str] | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, Any]:
        payload = self._series_payload(
            code,
            market,
            limit,
            _field_list(fields, DEFAULT_CANDLE_FIELDS),
            start,
            end,
        )
        payload["period"] = period
        payload["adjustment"] = adjustment
        return self.request("POST", "/api/v2/quotes/candle", payload)

    def ticks(
        self,
        code: str,
        *,
        market: Market = 1,
        limit: int = 1_000,
        fields: Sequence[str] | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/quotes/tick",
            self._series_payload(
                code,
                market,
                limit,
                _field_list(fields, DEFAULT_TICK_FIELDS),
                start,
                end,
            ),
        )

    def trends(
        self,
        code: str,
        *,
        market: Market = 1,
        limit: int = 1_000,
        fields: Sequence[str] | None = None,
        trade_date: date | datetime | str | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, Any]:
        payload = self._series_payload(
            code,
            market,
            limit,
            _field_list(fields, DEFAULT_TREND_FIELDS),
            start,
            end,
        )
        payload["tradeDate"] = _date_value(trade_date)
        return self.request(
            "POST",
            "/api/v2/quotes/trend",
            payload,
        )

    def security_info(
        self,
        codes: str | Sequence[str],
        *,
        market: Market = 1,
        info_type: int = 14_339,
        summary: int = 0,
    ) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/securities/info",
            {
                "market": market,
                "codes": _codes(codes),
                "infoTypeValue": info_type,
                "summary": summary,
            },
        )

    def related(self, code: str, *, market: Market = 1, limit: int = 50) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/securities/related",
            {"security": _security(code, market), "offset": 0, "limit": limit},
        )

    def security_blocks(self, codes: str | Sequence[str]) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/blocks/security-names",
            {"codes": _codes(codes)},
        )

    def industries(self, codes: str | Sequence[str]) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/industries/names",
            {"codes": _codes(codes)},
        )

    def block_id(self, block_name: str) -> dict[str, Any]:
        return self.request("POST", "/api/v2/blocks/id", {"blockName": block_name})

    def block_content(self, block_id: int) -> dict[str, Any]:
        return self.request("POST", "/api/v2/blocks/content", {"blockId": block_id})

    def rankings(
        self,
        *,
        codes: Sequence[str] | None = None,
        offset: int = 0,
        limit: int = 50,
        sort_field: int = 0,
        sort_order: int = 0,
    ) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/rankings/query",
            {
                "codes": list(codes or []),
                "offset": offset,
                "limit": limit,
                "sortFieldValue": sort_field,
                "sortOrderValue": sort_order,
            },
        )

    def call_auction(
        self,
        codes: str | Sequence[str],
        *,
        market: Market = 1,
        trade_date: date | datetime | str | None = None,
        fields: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/auction/call",
            {
                "market": market,
                "codes": _codes(codes),
                "tradeDate": _date_value(trade_date),
                "fields": _field_list(fields, DEFAULT_AUCTION_FIELDS),
            },
        )

    def level2(
        self,
        code: str,
        *,
        mode: Level2Mode = "orders",
        market: Market = 1,
        trade_date: date | datetime | str | None = None,
        limit: int = 1_000,
        start: str = "",
        fields: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        paths = {
            "orders": "/api/v2/level2/query",
            "trades": "/api/v2/level2/trade-query",
            "cancels": "/api/v2/level2/cancel-query",
        }
        if mode not in paths:
            raise ValueError(f"不支持的 Level2 mode：{mode}")
        return self.request(
            "POST",
            paths[mode],
            {
                "security": _security(code, market),
                "start": start,
                "limit": limit,
                "tradeDate": _date_value(trade_date),
                "fields": _field_list(fields, DEFAULT_LEVEL2_FIELDS[mode]),
            },
        )

    def news(self, keyword: str, *, limit: int = 100) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/news/query",
            {"businessType": "newsflash", "keyword": keyword, "limit": limit},
        )

    def wencai(self, query: str) -> dict[str, Any]:
        return self.request("POST", "/api/v2/wencai/query", {"queryText": query})

    def create_subscription(
        self,
        codes: str | Sequence[str],
        *,
        kind: int = 1,
        market: Market = 1,
        fields: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/subscriptions/create",
            {
                "kind": kind,
                "market": market,
                "codes": _codes(codes),
                "fields": list(fields or []),
            },
        )

    def poll_subscription(
        self,
        subscription_id: str,
        *,
        max_items: int = 100,
        wait_timeout_ms: int = 15_000,
    ) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/subscriptions/poll",
            {
                "subscriptionId": subscription_id,
                "maxItems": max_items,
                "waitTimeoutMs": wait_timeout_ms,
            },
        )

    def cancel_subscription(self, subscription_id: str) -> dict[str, Any]:
        return self.request(
            "POST",
            "/api/v2/subscriptions/cancel",
            {"subscriptionId": subscription_id},
        )

    @staticmethod
    def records(response_data: Mapping[str, Any]) -> list[dict[str, Any]]:
        items = response_data.get("items")
        if not isinstance(items, list):
            return []

        records: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue

            security = item.get("security") if isinstance(item.get("security"), dict) else {}
            security_columns = {
                "market": security.get("market"),
                "code": security.get("code"),
                "fullCode": security.get("fullCode"),
                "securityName": security.get("name"),
            }
            points = item.get("points")
            if isinstance(points, list):
                for point in points:
                    if not isinstance(point, dict):
                        continue
                    values = point.get("values") if isinstance(point.get("values"), dict) else {}
                    records.append(
                        {
                            **security_columns,
                            "timestampUtc": point.get("timestampUtc"),
                            **values,
                        }
                    )
                continue

            values = item.get("values") if isinstance(item.get("values"), dict) else {}
            records.append(
                {
                    **security_columns,
                    "id": item.get("id"),
                    "title": item.get("title"),
                    "timestampUtc": item.get("timestampUtc"),
                    **values,
                }
            )
        return records

    @staticmethod
    def to_dataframe(response_data: Mapping[str, Any]):
        try:
            import pandas as pd
        except ImportError as error:
            raise RuntimeError('请先安装 pandas 扩展：pip install "tonghuasun-codex[pandas]"') from error
        return pd.DataFrame(Client.records(response_data))

    @staticmethod
    def _series_payload(
        code: str,
        market: Market,
        limit: int,
        fields: Sequence[str],
        start: datetime | None,
        end: datetime | None,
    ) -> dict[str, Any]:
        return {
            "market": market,
            "security": _security(code, market),
            "codes": [code],
            "startTimeUtc": _datetime_value(start),
            "endTimeUtc": _datetime_value(end),
            "limit": limit,
            "fields": list(fields),
        }

    @staticmethod
    def _raise_api_error(raw: bytes, *, status: int, fallback: str) -> None:
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ApiError(fallback, status=status) from None
        if isinstance(value, dict):
            Client._raise_envelope_error(value, status=status)
        raise ApiError(fallback, status=status)

    @staticmethod
    def _raise_envelope_error(value: Mapping[str, Any], *, status: int) -> None:
        error = value.get("error")
        details = error if isinstance(error, dict) else {}
        code = str(details.get("code") or error or "api_error")
        message = str(details.get("message") or value.get("message") or "同花顺插件请求失败。")
        raise ApiError(
            message,
            code=code,
            status=status,
            trace_id=str(value.get("traceId") or ""),
            details=details.get("details") if details else dict(value),
        )


def _codes(value: str | Iterable[str]) -> list[str]:
    items = [value] if isinstance(value, str) else list(value)
    normalized = [item.strip() for item in items if item and item.strip()]
    if not normalized:
        raise ValueError("codes 不能为空。")
    return normalized


def _security(code: str, market: Market) -> dict[str, Any]:
    normalized = code.strip()
    if not normalized:
        raise ValueError("code 不能为空。")
    return {"market": market, "code": normalized.split(".", 1)[0], "fullCode": normalized}


def _field_list(value: Sequence[str] | None, defaults: Sequence[str]) -> list[str]:
    fields = [field.strip() for field in value or defaults if field and field.strip()]
    if not fields:
        raise ValueError("fields 不能为空。")
    return fields


def _datetime_value(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _date_value(value: date | datetime | str | None) -> str:
    if value is None:
        return ""
    return value.isoformat() if isinstance(value, (date, datetime)) else value
