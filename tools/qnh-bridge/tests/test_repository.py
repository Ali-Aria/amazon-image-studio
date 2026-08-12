from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from qnh_bridge.domain import validate_and_normalize_plan  # noqa: E402
from qnh_bridge.repository import PlanConflictError, PlanRepository  # noqa: E402
from fixtures import bridge_config, plan  # noqa: E402


class PlanRepositoryTests(unittest.TestCase):
    def test_creates_an_immutable_hashed_plan_and_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = bridge_config(tmp)
            normalized, assets = validate_and_normalize_plan(plan(), config)
            repo = PlanRepository(tmp)

            summary = repo.create(normalized, assets)
            loaded = repo.load_plan(summary["planId"])

            self.assertRegex(summary["planId"], r"^qnh-[a-f0-9]{16}$")
            self.assertEqual(len(summary["sha256"]), 64)
            self.assertIn("确认执行", summary["confirmationPhrase"])
            self.assertEqual(summary["removed"], 2)
            self.assertEqual(summary["addedMain"], 1)
            self.assertEqual(summary["addedSpecial"], 1)
            self.assertEqual(loaded["sha256"], summary["sha256"])
            self.assertTrue((pathlib.Path(tmp) / "plans" / summary["planId"] / "plan.json").is_file())
            self.assertEqual(len(list((pathlib.Path(tmp) / "plans" / summary["planId"] / "assets").iterdir())), 3)

    def test_same_content_is_idempotent_but_existing_different_content_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = bridge_config(tmp)
            normalized, assets = validate_and_normalize_plan(plan(), config)
            repo = PlanRepository(tmp)
            first = repo.create(normalized, assets)
            second = repo.create(normalized, assets)
            self.assertEqual(first, second)

            plan_path = pathlib.Path(tmp) / "plans" / first["planId"] / "plan.json"
            tampered = json.loads(plan_path.read_text(encoding="utf-8"))
            tampered["product"]["name"] = "被篡改"
            plan_path.write_text(json.dumps(tampered, ensure_ascii=False), encoding="utf-8")
            with self.assertRaisesRegex(PlanConflictError, "不可变"):
                repo.create(normalized, assets)

    def test_state_and_jsonl_ledger_are_atomic_and_recoverable(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = bridge_config(tmp)
            normalized, assets = validate_and_normalize_plan(plan(), config)
            repo = PlanRepository(tmp)
            summary = repo.create(normalized, assets)

            repo.update_state(summary["planId"], status="executing", startedAt="2026-08-12T12:10:00Z")
            repo.append_ledger(summary["planId"], "snapshot", "pass", "写前快照已保存")
            state = repo.load_state(summary["planId"])

            self.assertEqual(state["status"], "executing")
            self.assertEqual(state["ledger"][0]["phase"], "snapshot")
            ledger_path = pathlib.Path(tmp) / "plans" / summary["planId"] / "ledger.jsonl"
            self.assertEqual(len(ledger_path.read_text(encoding="utf-8").splitlines()), 1)


if __name__ == "__main__":
    unittest.main()
