from __future__ import annotations

import copy
import fcntl
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from qnh_bridge.adapters import FakeQnhAdapter  # noqa: E402
from qnh_bridge.service import (  # noqa: E402
    BridgeBusyError,
    BridgeConflictError,
    BridgeService,
    ConfirmationError,
)
from fixtures import bridge_config, inventory, plan  # noqa: E402


class RecordingFakeAdapter(FakeQnhAdapter):
    def __init__(self, snapshot: dict):
        super().__init__({"fakeInventory": snapshot})
        self.calls: list[str] = []
        self.fail_upload_at: int | None = None
        self.fail_write = False
        self.raise_after_write = False

    def read_inventory(self, spu_id: str) -> dict:
        self.calls.append(f"read:{spu_id}")
        return super().read_inventory(spu_id)

    def upload_image(self, path: pathlib.Path, mime: str, filename: str) -> dict:
        self.calls.append(f"upload:{filename}")
        upload_number = sum(call.startswith("upload:") for call in self.calls)
        if self.fail_upload_at == upload_number:
            raise RuntimeError("模拟上传失败")
        return super().upload_image(path, mime, filename)

    def write_gallery(self, spu_id: str, desired: dict, before: dict) -> dict:
        self.calls.append(f"write:{spu_id}")
        if self.fail_write:
            raise RuntimeError("模拟写入失败")
        result = super().write_gallery(spu_id, desired, before)
        if self.raise_after_write:
            raise RuntimeError("模拟写入回执异常")
        return result


class BridgeServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = bridge_config(self.temp.name)
        self.adapter = RecordingFakeAdapter(inventory())
        self.service = BridgeService(self.config, self.adapter)

    def create_plan(self) -> dict:
        return self.service.create_plan(plan())

    def test_health_exposes_only_identity_mode_version_and_busy_state(self):
        self.assertEqual(self.service.health(), {
            "version": "1.0.0",
            "mode": "fake",
            "storeName": "演练门店",
            "tenantId": "1013857",
            "storeId": "1312360",
            "busy": False,
            "activePlanId": None,
        })

    def test_inventory_requires_numeric_spu_and_returns_authoritative_fingerprint(self):
        snapshot = self.service.inventory("123456789")
        self.assertEqual(snapshot["fingerprint"], inventory()["fingerprint"])
        self.assertEqual(snapshot["mainImages"][0]["id"], "main:0")
        with self.assertRaisesRegex(ValueError, "数字"):
            self.service.inventory("../123")

    def test_create_and_get_plan_return_frontend_execution_shapes(self):
        summary = self.create_plan()
        status = self.service.get_plan(summary["planId"])

        self.assertEqual(summary["status"], "planned")
        self.assertEqual(status["planId"], summary["planId"])
        self.assertEqual(status["status"], "planned")
        self.assertEqual(status["ledger"], [])

    def test_execute_requires_exact_one_time_confirmation_phrase(self):
        summary = self.create_plan()
        with self.assertRaisesRegex(ConfirmationError, "确认短语"):
            self.service.execute(summary["planId"], "确认执行 WRONG")
        self.assertEqual(self.service.get_plan(summary["planId"])["status"], "planned")

    def test_successful_execution_snapshots_uploads_writes_and_fresh_exact_verifies(self):
        summary = self.create_plan()
        result = self.service.execute(summary["planId"], summary["confirmationPhrase"])

        self.assertEqual(result["status"], "succeeded")
        self.assertIsNone(result["error"])
        phases = [entry["phase"] for entry in result["ledger"]]
        self.assertEqual(phases, ["preflight", "snapshot", "upload", "upload", "write", "verify"])
        self.assertEqual(sum(call.startswith("upload:") for call in self.adapter.calls), 2)
        self.assertEqual(sum(call.startswith("write:") for call in self.adapter.calls), 1)
        fresh = self.adapter.read_inventory("123456789")
        self.assertEqual(fresh["mainImages"][0]["url"].startswith("https://fake-upload.local/"), True)
        self.assertEqual(len(fresh["mainImages"]), 2)
        self.assertEqual(fresh["detailImages"][0]["url"], "https://img.example/detail-0.jpg")
        self.assertEqual(fresh["specialImages"][0]["images"][0]["url"].startswith("https://fake-upload.local/"), True)
        self.assertTrue((pathlib.Path(self.temp.name) / "plans" / summary["planId"] / "snapshot_before.json").is_file())

    def test_write_receipt_error_still_succeeds_when_immediate_fresh_fetch_is_exact(self):
        summary = self.create_plan()
        self.adapter.raise_after_write = True

        result = self.service.execute(summary["planId"], summary["confirmationPhrase"])

        self.assertEqual(result["status"], "succeeded")
        self.assertIsNone(result["error"])
        write_entries = [entry for entry in result["ledger"] if entry["phase"] == "write"]
        self.assertEqual(write_entries[-1]["status"], "info")
        self.assertIn("模拟写入回执异常", write_entries[-1]["message"])
        self.assertEqual(result["ledger"][-1]["phase"], "verify")
        self.assertEqual(result["ledger"][-1]["status"], "pass")

    def test_stale_inventory_stops_before_upload_and_marks_failed(self):
        summary = self.create_plan()
        stale = inventory()
        stale["mainImages"][0]["url"] = "https://img.example/changed.jpg"
        stale["fingerprint"] = "changed-fingerprint"
        self.adapter.set_inventory(stale)

        with self.assertRaisesRegex(BridgeConflictError, "图集已变化"):
            self.service.execute(summary["planId"], summary["confirmationPhrase"])

        result = self.service.get_plan(summary["planId"])
        self.assertEqual(result["status"], "failed")
        self.assertFalse(any(call.startswith("upload:") for call in self.adapter.calls))
        self.assertFalse(any(call.startswith("write:") for call in self.adapter.calls))

    def test_upload_failure_stops_before_any_write_and_keeps_ledger(self):
        summary = self.create_plan()
        self.adapter.fail_upload_at = 1

        with self.assertRaisesRegex(RuntimeError, "模拟上传失败"):
            self.service.execute(summary["planId"], summary["confirmationPhrase"])

        result = self.service.get_plan(summary["planId"])
        self.assertEqual(result["status"], "failed")
        self.assertFalse(any(call.startswith("write:") for call in self.adapter.calls))
        self.assertEqual(result["ledger"][-1]["status"], "fail")

    def test_store_file_lock_rejects_concurrent_execution(self):
        summary = self.create_plan()
        lock_path = pathlib.Path(self.temp.name) / "locks" / "store-1312360.lock"
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with lock_path.open("a+") as handle:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(BridgeBusyError, "正在执行"):
                self.service.execute(summary["planId"], summary["confirmationPhrase"])
        self.assertEqual(self.service.get_plan(summary["planId"])["status"], "planned")

    def test_a_succeeded_plan_cannot_execute_twice(self):
        summary = self.create_plan()
        self.service.execute(summary["planId"], summary["confirmationPhrase"])
        with self.assertRaisesRegex(BridgeConflictError, "已经成功"):
            self.service.execute(summary["planId"], summary["confirmationPhrase"])


if __name__ == "__main__":
    unittest.main()
