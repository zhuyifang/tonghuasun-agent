import io
import json
import unittest
from unittest.mock import patch

from fqgate_client import Client, ConnectionConfig


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
                base_url="http://127.0.0.1:17281",
                mcp_url="http://127.0.0.1:17281/mcp",
            )
        )

    @patch("fqgate_client.client.urlopen")
    def test_market_data_uses_fqgate_path_without_access_token(self, urlopen) -> None:
        urlopen.return_value = FakeResponse({"rows": []})
        value = self.client.market_data([{"market": "USHA", "code": "600519"}])

        self.assertEqual(value, {"rows": []})
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "http://127.0.0.1:17281/v1/market/realtime/cn")
        self.assertNotIn("X-tonghuasun-codex-token", request.headers)
        self.assertEqual(json.loads(request.data)["securities"][0]["market"], "USHA")

    @patch("fqgate_client.client.urlopen")
    def test_klines_preserves_fqgate_parameter_names(self, urlopen) -> None:
        urlopen.return_value = FakeResponse({"rows": []})
        self.client.klines("USHA", "600519", count=30, interval="day", adjust="forward")

        payload = json.loads(urlopen.call_args.args[0].data)
        self.assertEqual(payload["count"], 30)
        self.assertEqual(payload["interval"], "day")
        self.assertEqual(payload["adjust"], "forward")
        self.assertNotIn("period", payload)

    @patch("fqgate_client.client.urlopen")
    def test_level2_uses_named_fields_and_explicit_range(self, urlopen) -> None:
        urlopen.return_value = FakeResponse({"semantic_records": []})
        self.client.level2(
            "USHA",
            "600519",
            kind="orders",
            fields=["order_no", "price", "side", "volume"],
            range={"Recent": {"count": 20, "end": 0}},
        )

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data)
        self.assertEqual(request.full_url, "http://127.0.0.1:17281/v1/market/level2/orders")
        self.assertEqual(payload["range"]["Recent"]["count"], 20)
        self.assertEqual(payload["semantic"], True)


if __name__ == "__main__":
    unittest.main()
