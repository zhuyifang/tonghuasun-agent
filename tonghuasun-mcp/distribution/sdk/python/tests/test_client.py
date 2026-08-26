import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

from tonghuasun_codex import ApiError, Client, ConnectionConfig


class FakeResponse:
    status = 200

    def __init__(self, value: object) -> None:
        self.buffer = io.BytesIO(json.dumps(value).encode("utf-8"))

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self) -> bytes:
        return self.buffer.read()


class ClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = Client(
            ConnectionConfig(
                base_url="http://127.0.0.1:17180",
                access_token="local-token",
                product_home=Path("."),
            )
        )

    @patch("tonghuasun_codex.client.urlopen")
    def test_snapshot_returns_unwrapped_bottom_data(self, urlopen) -> None:
        urlopen.return_value = FakeResponse(
            {"ok": True, "traceId": "t1", "data": {"items": [{"values": {"latest": 6.71}}]}}
        )

        value = self.client.snapshot(["601727.SH"], fields=["*"])

        self.assertEqual(value["items"][0]["values"]["latest"], 6.71)
        request = urlopen.call_args.args[0]
        self.assertEqual(request.headers["X-tonghuasun-codex-token"], "local-token")
        self.assertEqual(json.loads(request.data)["fields"], ["*"])

    @patch("tonghuasun_codex.client.urlopen")
    def test_api_envelope_error_keeps_code_and_trace(self, urlopen) -> None:
        urlopen.return_value = FakeResponse(
            {
                "ok": False,
                "traceId": "trace-1",
                "error": {"code": "not_ready", "message": "宿主尚未就绪。"},
            }
        )

        with self.assertRaises(ApiError) as context:
            self.client.snapshot("601727.SH")

        self.assertEqual(context.exception.code, "not_ready")
        self.assertEqual(context.exception.trace_id, "trace-1")

    @patch("tonghuasun_codex.client.urlopen")
    def test_candles_sends_adjustment_mode(self, urlopen) -> None:
        urlopen.return_value = FakeResponse({"ok": True, "data": {"items": []}})

        self.client.candles("600151.SH", period=7, adjustment=1)

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["period"], 7)
        self.assertEqual(payload["adjustment"], 1)

    @patch("tonghuasun_codex.client.urlopen")
    def test_subscription_only_sends_realtime_subscription_fields(self, urlopen) -> None:
        urlopen.return_value = FakeResponse({"ok": True, "data": {"subscriptionId": "sub-1"}})

        self.client.create_subscription("601727.SH", fields=["latest"])

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(payload["codes"], ["601727.SH"])
        self.assertEqual(payload["fields"], ["latest"])
        self.assertNotIn("capture", payload)
        self.assertNotIn("captureTtlSeconds", payload)
        self.assertNotIn("ttlSeconds", payload)

    @patch("tonghuasun_codex.client.urlopen")
    def test_level2_trades_use_true_transaction_fields(self, urlopen) -> None:
        urlopen.return_value = FakeResponse({"ok": True, "data": {"items": []}})

        self.client.level2("600519.SH", mode="trades")

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        self.assertIn("transaction_count", payload["fields"])
        self.assertIn("buy_order_no", payload["fields"])
        self.assertIn("sell_order_no", payload["fields"])
        self.assertNotIn("transaction_amount", payload["fields"])

    def test_records_flattens_series_points_for_quant_analysis(self) -> None:
        records = Client.records(
            {
                "items": [
                    {
                        "security": {
                            "market": 1,
                            "code": "601727",
                            "fullCode": "601727.SH",
                            "name": "上海电气",
                        },
                        "points": [
                            {
                                "timestampUtc": "2026-08-14T07:00:00Z",
                                "values": {"latest": 6.71, "transaction_volume": 100},
                            }
                        ],
                    }
                ]
            }
        )

        self.assertEqual(records[0]["fullCode"], "601727.SH")
        self.assertEqual(records[0]["latest"], 6.71)
        self.assertEqual(records[0]["transaction_volume"], 100)

if __name__ == "__main__":
    unittest.main()
