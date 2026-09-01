import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tonghuasun_codex.discovery import discover_connection


class DiscoveryTests(unittest.TestCase):
    def test_prefers_runtime_endpoint_and_reads_local_token(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            (home / "runtime").mkdir()
            (home / "config.json").write_text(
                json.dumps({"preferredPort": 17180, "localAccessToken": "secret"}),
                encoding="utf-8",
            )
            (home / "runtime" / "endpoint.json").write_text(
                json.dumps(
                    {
                        "baseUrl": "http://127.0.0.1:17200",
                        "pluginVersion": "1.2.3",
                        "processId": 1234,
                    }
                ),
                encoding="utf-8",
            )

            connection = discover_connection(home)

        self.assertEqual(connection.base_url, "http://127.0.0.1:17200")
        self.assertEqual(connection.websocket_url, "ws://127.0.0.1:17200/api/v2/realtime/ws")
        self.assertEqual(connection.access_token, "secret")
        self.assertEqual(connection.process_id, 1234)

    def test_uses_same_environment_priority_as_configurer_and_plugin(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            agent_home = root / "agent-home"
            legacy_home = root / "legacy-home"
            for home, token in ((agent_home, "agent-token"), (legacy_home, "legacy-token")):
                home.mkdir()
                (home / "config.json").write_text(
                    json.dumps({"preferredPort": 17180, "localAccessToken": token}),
                    encoding="utf-8",
                )

            with patch.dict(
                os.environ,
                {
                    "TONGHUASUN_AGENT_HOME": str(agent_home),
                    "TONGHUASUN_CODEX_HOME": str(legacy_home),
                },
                clear=False,
            ):
                connection = discover_connection()

        self.assertEqual(connection.product_home, agent_home.resolve())
        self.assertEqual(connection.access_token, "agent-token")


if __name__ == "__main__":
    unittest.main()
