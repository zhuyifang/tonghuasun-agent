import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from publish_agent_release import collect_artifacts, read_release_manifest


class PublishAgentReleaseTests(unittest.TestCase):
    def create_fixture(self, root: Path):
        version = "1.2.3"
        packages = []
        checksum = []
        for adapter, extension in (("codex", "zip"), ("claude-code", "zip"), ("deepseek-harness", "tgz"), ("doubao", "zip"), ("openclaw", "zip"), ("qianwen", "zip"), ("workbuddy", "zip"), ("zcode", "zip"), ("zcode-marketplace", "zip")):
            file_name = f"fqgate-agent-{adapter}-{version}.{extension}"
            content = file_name.encode()
            (root / file_name).write_bytes(content)
            digest = hashlib.sha256(content).hexdigest()
            packages.append({"adapter": adapter, "fileName": file_name, "size": len(content), "sha256": digest})
            checksum.append(f"{digest}  {file_name}")
        (root / f"fqgate-agent-{version}-SHA256SUMS.txt").write_text("\n".join(sorted(checksum)) + "\n")
        manifest = {
            "schemaVersion": 1,
            "component": "fqgate-agent",
            "status": "unpublished",
            "version": version,
            "publishedAtUtc": None,
            "releaseUrls": {"github": "https://example.test"},
            "releaseNotes": ["修复问题"],
            "packages": packages,
        }
        manifest_path = root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        return version, manifest_path

    def test_collects_manifest_artifacts_and_checksum(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version, manifest_path = self.create_fixture(root)
            manifest = read_release_manifest(manifest_path, version)
            manifest_path.unlink()
            self.assertEqual(len(collect_artifacts(root, manifest)), 10)

    def test_rejects_changed_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            version, manifest_path = self.create_fixture(root)
            manifest = read_release_manifest(manifest_path, version)
            manifest_path.unlink()
            (root / manifest["packages"][0]["fileName"]).write_text("changed")
            with self.assertRaisesRegex(ValueError, "不一致"):
                collect_artifacts(root, manifest)


if __name__ == "__main__":
    unittest.main()
