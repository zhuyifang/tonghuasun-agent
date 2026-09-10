import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fqgate_client.discovery import ConfigurationError, discover_connection


class DiscoveryTests(unittest.TestCase):
    def test_reads_shared_agent_config_without_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "agent-plugin.json"
            config_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "executablePath": "C:/FQGate/fqgate.exe",
                        "mcpUrl": "http://localhost:18000/mcp",
                        "fqgateVersion": "0.1.0",
                    }
                ),
                encoding="utf-8",
            )
            connection = discover_connection(config_path)

        self.assertEqual(connection.base_url, "http://localhost:18000")
        self.assertEqual(connection.mcp_url, "http://localhost:18000/mcp")
        self.assertEqual(connection.websocket_url, "ws://localhost:18000/v1/market/stream")
        self.assertEqual(connection.fqgate_version, "0.1.0")

    def test_environment_can_override_only_with_loopback_url(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            config_path = Path(directory) / "missing.json"
            with patch.dict("os.environ", {"FQGATE_MCP_URL": "http://127.0.0.1:19000/mcp"}):
                connection = discover_connection(config_path)
            self.assertEqual(connection.base_url, "http://127.0.0.1:19000")

            with patch.dict("os.environ", {"FQGATE_MCP_URL": "http://192.168.1.1:17281/mcp"}):
                with self.assertRaises(ConfigurationError):
                    discover_connection(config_path)


if __name__ == "__main__":
    unittest.main()
