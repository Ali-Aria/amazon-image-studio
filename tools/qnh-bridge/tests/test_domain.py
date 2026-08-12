from __future__ import annotations

import copy
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from qnh_bridge.domain import (  # noqa: E402
    PlanValidationError,
    build_desired_gallery,
    canonical_json,
    normalize_bridge_config,
    validate_and_normalize_plan,
)
from fixtures import PNG_DATA_URL, bridge_config, plan  # noqa: E402


class ConfigValidationTests(unittest.TestCase):
    def test_requires_a_literal_ipv4_loopback_bind(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = bridge_config(tmp)
            config["bindHost"] = "0.0.0.0"
            with self.assertRaisesRegex(PlanValidationError, "127.0.0.1"):
                normalize_bridge_config(config)

    def test_requires_store_identity_and_safe_limits(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = bridge_config(tmp)
            del config["tenantId"]
            with self.assertRaisesRegex(PlanValidationError, "tenantId"):
                normalize_bridge_config(config)


class PlanValidationTests(unittest.TestCase):
    def setUp(self):
        self.config = bridge_config("/tmp/qnh-bridge-tests")

    def assert_invalid(self, draft: dict, message: str):
        with self.assertRaisesRegex(PlanValidationError, message):
            validate_and_normalize_plan(draft, self.config)

    def test_accepts_a_complete_reviewed_plan_and_removes_data_urls(self):
        normalized, assets = validate_and_normalize_plan(plan(), self.config)

        self.assertEqual(normalized["schemaVersion"], 1)
        self.assertEqual(normalized["product"]["spuId"], "123456789")
        self.assertNotIn("sourceDataUrl", normalized["outputs"][0])
        self.assertEqual(len(assets), 4)
        self.assertTrue(all(asset["mime"] == "image/png" for asset in assets))

    def test_rejects_identity_mismatch_and_non_numeric_spu(self):
        wrong_store = plan()
        wrong_store["identity"]["storeId"] = "999"
        self.assert_invalid(wrong_store, "门店身份")

        wrong_spu = plan()
        wrong_spu["product"]["spuId"] = "../123"
        self.assert_invalid(wrong_spu, "数字")

    def test_requires_exactly_one_decision_for_every_existing_image(self):
        missing = plan()
        missing["inventory"]["decisions"].pop()
        self.assert_invalid(missing, "全部现有图片")

        extra = plan()
        extra["inventory"]["decisions"].append(copy.deepcopy(extra["inventory"]["decisions"][0]))
        self.assert_invalid(extra, "重复")

    def test_requires_removal_reason_and_snapshot_identity(self):
        no_reason = plan()
        no_reason["inventory"]["decisions"][1]["reason"] = "  "
        self.assert_invalid(no_reason, "剔除原因")

        swapped_url = plan()
        swapped_url["inventory"]["decisions"][0]["url"] = "https://img.example/other.jpg"
        self.assert_invalid(swapped_url, "快照")

    def test_rejects_a_fingerprint_that_does_not_match_the_embedded_snapshot(self):
        tampered = plan()
        tampered["inventory"]["mainImages"][0]["url"] = "https://img.example/tampered.jpg"
        tampered["inventory"]["decisions"][0]["url"] = "https://img.example/tampered.jpg"
        self.assert_invalid(tampered, "指纹")

    def test_requires_pass_checklist_and_distinct_ai_source(self):
        unchecked = plan()
        unchecked["outputs"][0]["checklist"]["brand"] = False
        self.assert_invalid(unchecked, "保真核对")

        same = plan()
        same["outputs"][0]["outputImageId"] = same["outputs"][0]["sourceImageId"]
        self.assert_invalid(same, "不能相同")

    def test_enforces_slot_target_role_and_processing_mode_allowlists(self):
        wrong_target = plan()
        wrong_target["outputs"][0]["target"] = "detail"
        self.assert_invalid(wrong_target, "图位")

        wrong_role = plan()
        wrong_role["outputs"][0]["sourceRole"] = "arbitrary_file"
        self.assert_invalid(wrong_role, "来源角色")

        wrong_mode = plan()
        wrong_mode["outputs"][0]["processingMode"] = "shell"
        self.assert_invalid(wrong_mode, "处理模式")

    def test_allows_source_only_document_but_rejects_generated_document(self):
        document = plan()
        item = document["outputs"][1]
        item.update({
            "pictureType": 24,
            "sourceRole": "authentic_document",
            "processingMode": "source-only",
            "sourceImageId": "document-a",
            "outputImageId": "document-a",
            "sourceDataUrl": PNG_DATA_URL,
            "outputDataUrl": PNG_DATA_URL,
        })
        validate_and_normalize_plan(document, self.config)

        generated = copy.deepcopy(document)
        generated["outputs"][1]["processingMode"] = "ai"
        self.assert_invalid(generated, "只能原图直传")

    def test_requires_explicit_available_special_type_and_removal_of_old_image(self):
        missing_type = plan()
        missing_type["outputs"][1]["pictureType"] = None
        self.assert_invalid(missing_type, "pictureType")

        unknown_type = plan()
        unknown_type["outputs"][1]["pictureType"] = 999
        self.assert_invalid(unknown_type, "不存在")

        old_kept = plan()
        old_kept["inventory"]["decisions"][3].update({"decision": "keep", "reason": ""})
        self.assert_invalid(old_kept, "已有图片")

    def test_rejects_unapproved_mime_oversize_and_missing_detach_acknowledgement(self):
        wrong_mime = plan()
        wrong_mime["outputs"][0]["outputDataUrl"] = "data:image/svg+xml;base64,PHN2Zy8+"
        self.assert_invalid(wrong_mime, "PNG、JPEG 或 WebP")

        bad_signature = plan()
        bad_signature["outputs"][0]["outputDataUrl"] = "data:image/png;base64,bm90LWEtcG5n"
        self.assert_invalid(bad_signature, "文件头")

        too_large = plan()
        config = {**self.config, "maxImageBytes": 4}
        with self.assertRaisesRegex(PlanValidationError, "大小上限"):
            validate_and_normalize_plan(too_large, config)

        no_ack = plan()
        no_ack["detachAcknowledged"] = False
        self.assert_invalid(no_ack, "解耦")

    def test_enforces_configured_final_gallery_limits(self):
        config = {**self.config, "maxMainImages": 1}
        with self.assertRaisesRegex(PlanValidationError, "主图上限"):
            validate_and_normalize_plan(plan(), config)

    def test_rejects_a_noop_plan(self):
        noop = plan()
        noop["outputs"] = []
        for decision in noop["inventory"]["decisions"]:
            decision.update({"decision": "keep", "reason": ""})
        self.assert_invalid(noop, "没有任何变更")

    def test_builds_deterministic_final_gallery_order(self):
        normalized, _ = validate_and_normalize_plan(plan(), self.config)
        desired = build_desired_gallery(normalized, {
            "01-main": "https://upload/main.jpg",
            "08-special": "https://upload/special.jpg",
        })

        self.assertEqual(desired["main"], ["https://upload/main.jpg", "https://img.example/main-0.jpg"])
        self.assertEqual(desired["detail"], ["https://img.example/detail-0.jpg"])
        self.assertEqual(desired["special"]["22"], ["https://upload/special.jpg"])
        self.assertEqual(desired["special"]["24"], [])

    def test_canonical_json_is_order_stable(self):
        left = canonical_json({"b": 2, "a": {"d": 4, "c": 3}})
        right = canonical_json({"a": {"c": 3, "d": 4}, "b": 2})
        self.assertEqual(left, right)


if __name__ == "__main__":
    unittest.main()
