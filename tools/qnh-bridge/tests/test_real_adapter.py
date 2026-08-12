from __future__ import annotations

import copy
import json
import pathlib
import sys
import tempfile
import types
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from qnh_bridge.adapters import RealQnhAdapter  # noqa: E402
from fixtures import bridge_config  # noqa: E402


class StubPipeline:
    instances: list["StubPipeline"] = []

    def __init__(self, config_path: str):
        self.config_path = config_path
        self.scripts: list[tuple[str, int]] = []
        self.write_result = {"code": 0, "message": "accepted"}
        self.inventory_result = {
            "productName": "真实商品 500ml",
            "mainUrls": ["https://img.example/main-a.jpg", "https://img.example/main-b.jpg"],
            "detailUrls": ["https://img.example/detail-a.jpg"],
            "special": [
                {"pictureType": 22, "label": "选购指南图", "required": True, "urls": []},
                {"pictureType": 24, "label": "资质图", "required": False, "urls": ["https://img.example/cert.jpg"]},
            ],
            "customizedMain": False,
            "customizedDetail": True,
        }
        StubPipeline.instances.append(self)

    def run(self, script: str, timeout: int = 150):
        self.scripts.append((script, timeout))
        if "QNH_BRIDGE_INVENTORY" in script:
            return copy.deepcopy(self.inventory_result)
        if "QNH_BRIDGE_WRITE" in script:
            return copy.deepcopy(self.write_result)
        raise AssertionError("unexpected script")


class StubModule(types.SimpleNamespace):
    def __init__(self):
        self.upload_calls: list[tuple[object, pathlib.Path, str]] = []
        super().__init__(Pipeline=StubPipeline, UPDATE_API="/qnh-gw3/api/product/store/update")

    def upload_file(self, pipeline, path, filename):
        self.upload_calls.append((pipeline, pathlib.Path(path), filename))
        return "https://s3plus.meituan.net/test-upload", pathlib.Path(path).stat().st_size


class RealQnhAdapterTests(unittest.TestCase):
    def setUp(self):
        StubPipeline.instances.clear()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = pathlib.Path(self.temp.name) / "pipeline"
        (root / "bin").mkdir(parents=True)
        (root / "bin" / "qnhimg.py").write_text("# injected in tests\n", encoding="utf-8")
        self.qnh_config = root / "configs" / "store.json"
        self.qnh_config.parent.mkdir()
        self.qnh_config.write_text(json.dumps({
            "name": "真实门店",
            "tenantId": "1013857",
            "storeId": "1312360",
            "cdpPort": 9334,
            "origin": "https://qnh.meituan.com",
            "outDir": str(root / "output"),
        }, ensure_ascii=False), encoding="utf-8")
        self.config = bridge_config(str(pathlib.Path(self.temp.name) / "bridge-data"))
        self.config.update({
            "mode": "real",
            "storeName": "真实门店",
            "pipelineRoot": str(root),
            "qnhConfig": str(self.qnh_config),
        })
        self.module = StubModule()

    def adapter(self) -> RealQnhAdapter:
        return RealQnhAdapter(self.config, pipeline_module=self.module)

    def test_startup_requires_pipeline_files_and_matching_store_identity(self):
        wrong = copy.deepcopy(self.config)
        wrong["storeId"] = "999"
        with self.assertRaisesRegex(ValueError, "门店身份"):
            RealQnhAdapter(wrong, pipeline_module=self.module)

        missing = copy.deepcopy(self.config)
        missing["pipelineRoot"] = str(pathlib.Path(self.temp.name) / "missing")
        with self.assertRaisesRegex(ValueError, "qnhimg.py"):
            RealQnhAdapter(missing, pipeline_module=self.module)

    def test_read_inventory_uses_scope_assertion_and_normalizes_all_three_galleries(self):
        adapter = self.adapter()
        snapshot = adapter.read_inventory("2077000000000000001")

        self.assertEqual(snapshot["spuId"], "2077000000000000001")
        self.assertEqual(snapshot["mainImages"][1], {
            "id": "main:1", "kind": "main", "index": 1, "url": "https://img.example/main-b.jpg",
        })
        self.assertEqual(snapshot["detailImages"][0]["id"], "detail:0")
        self.assertEqual(snapshot["specialImages"][0]["images"], [])
        self.assertEqual(snapshot["specialImages"][1]["images"][0]["pictureType"], 24)
        self.assertTrue(snapshot["customizedDetail"])
        self.assertEqual(len(snapshot["fingerprint"]), 64)
        script = adapter.pipeline.scripts[0][0]
        self.assertIn("assertScope(d)", script)
        self.assertIn("await det(SPU)", script)
        self.assertNotIn("updateBody", script)

    def test_upload_delegates_to_proven_byte_readback_function(self):
        adapter = self.adapter()
        image = pathlib.Path(self.temp.name) / "output.png"
        image.write_bytes(b"image-bytes")

        result = adapter.upload_image(image, "image/png", "safe-name.png")

        self.assertEqual(result, {
            "url": "https://s3plus.meituan.net/test-upload",
            "bytes": 11,
            "readbackBytes": 11,
            "readbackOk": True,
            "mime": "image/png",
        })
        self.assertEqual(self.module.upload_calls[0][2], "safe-name.png")

    def test_upload_converts_legacy_system_exit_to_a_normal_failure(self):
        adapter = self.adapter()
        image = pathlib.Path(self.temp.name) / "output.png"
        image.write_bytes(b"image-bytes")

        def fail(*_args):
            raise SystemExit("legacy upload failed")

        self.module.upload_file = fail
        with self.assertRaisesRegex(RuntimeError, "legacy upload failed"):
            adapter.upload_image(image, "image/png", "safe-name.png")

    def test_write_submits_one_full_payload_with_scope_and_snapshot_assertions(self):
        adapter = self.adapter()
        before = adapter.read_inventory("2077000000000000001")
        desired = {
            "main": ["https://upload/new-main.jpg", "https://img.example/main-a.jpg"],
            "detail": ["https://img.example/detail-a.jpg", "https://upload/new-detail.jpg"],
            "special": {"22": ["https://upload/guide.jpg"], "24": []},
        }

        result = adapter.write_gallery("2077000000000000001", desired, before)

        self.assertEqual(result["code"], 0)
        scripts = [script for script, _ in adapter.pipeline.scripts if "QNH_BRIDGE_WRITE" in script]
        self.assertEqual(len(scripts), 1)
        script = scripts[0]
        self.assertIn("assertScope(d)", script)
        self.assertIn("updateBody(d)", script)
        self.assertIn("customizedPicUrlListFlag", script)
        self.assertIn("customizedPicContentListFlag", script)
        self.assertIn("mtSpecialPictureList", script)
        self.assertIn("JSON.stringify(current)!==JSON.stringify(EXPECTED)", script)
        self.assertIn("/qnh-gw3/api/product/store/update", script)

    def test_nonzero_write_response_raises_even_though_fresh_verify_is_separate(self):
        adapter = self.adapter()
        before = adapter.read_inventory("2077000000000000001")
        adapter.pipeline.write_result = {"code": 500, "message": "rejected"}

        with self.assertRaisesRegex(RuntimeError, "rejected"):
            adapter.write_gallery("2077000000000000001", {
                "main": [item["url"] for item in before["mainImages"]],
                "detail": [item["url"] for item in before["detailImages"]],
                "special": {str(group["pictureType"]): [item["url"] for item in group["images"]] for group in before["specialImages"]},
            }, before)

    def test_verify_requires_fresh_exact_lists_not_update_code(self):
        adapter = self.adapter()
        desired = {
            "main": ["https://img.example/main-a.jpg", "https://img.example/main-b.jpg"],
            "detail": ["https://img.example/detail-a.jpg"],
            "special": {"22": [], "24": ["https://img.example/cert.jpg"]},
        }
        passed = adapter.verify_gallery("2077000000000000001", desired)
        self.assertTrue(passed["exact"])

        adapter.pipeline.inventory_result["mainUrls"].reverse()
        failed = adapter.verify_gallery("2077000000000000001", desired)
        self.assertFalse(failed["exact"])


if __name__ == "__main__":
    unittest.main()
