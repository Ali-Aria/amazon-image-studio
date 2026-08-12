from __future__ import annotations

import contextlib
import fcntl
import json
import pathlib
from typing import Iterator

from .adapters import QnhAdapter
from .domain import build_desired_gallery, normalize_bridge_config, validate_and_normalize_plan
from .repository import PlanRepository, utc_now


class BridgeBusyError(RuntimeError):
    pass


class BridgeConflictError(RuntimeError):
    pass


class ConfirmationError(ValueError):
    pass


class BridgeService:
    def __init__(self, raw_config: dict, adapter: QnhAdapter):
        self.config = normalize_bridge_config(raw_config)
        self.adapter = adapter
        self.repository = PlanRepository(self.config["dataDir"])
        self.lock_dir = pathlib.Path(self.config["dataDir"]) / "locks"
        self.lock_dir.mkdir(parents=True, exist_ok=True)
        self._active_plan_id: str | None = None

    def health(self) -> dict:
        return {
            "version": self.config["version"],
            "mode": self.config["mode"],
            "storeName": self.config["storeName"],
            "tenantId": self.config["tenantId"],
            "storeId": self.config["storeId"],
            "busy": self._active_plan_id is not None,
            "activePlanId": self._active_plan_id,
        }

    def inventory(self, spu_id: str) -> dict:
        if not isinstance(spu_id, str) or not spu_id.isdigit():
            raise ValueError("SPU ID 必须是数字字符串")
        return self.adapter.read_inventory(spu_id)

    def create_plan(self, raw_plan: dict) -> dict:
        normalized, assets = validate_and_normalize_plan(raw_plan, self.config)
        return self.repository.create(normalized, assets)

    def get_plan(self, plan_id: str) -> dict:
        return self.repository.load_state(plan_id)

    @contextlib.contextmanager
    def _store_lock(self) -> Iterator[None]:
        path = self.lock_dir / f"store-{self.config['storeId']}.lock"
        with path.open("a+", encoding="utf-8") as handle:
            try:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise BridgeBusyError("该门店已有 QNH 图片任务正在执行") from exc
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def execute(self, plan_id: str, confirmation_phrase: str) -> dict:
        summary = self.repository.summary(plan_id)
        if confirmation_phrase != summary["confirmationPhrase"]:
            raise ConfirmationError("确认短语不一致")
        state = self.repository.load_state(plan_id)
        if state["status"] == "succeeded":
            raise BridgeConflictError("该计划已经成功执行，禁止重复写入")
        if state["status"] == "executing":
            raise BridgeBusyError("该计划正在执行")
        with self._store_lock():
            return self._execute_locked(plan_id)

    def _execute_locked(self, plan_id: str) -> dict:
        plan = self.repository.load_plan(plan_id)
        spu_id = plan["product"]["spuId"]
        self._active_plan_id = plan_id
        self.repository.update_state(plan_id, status="executing", startedAt=utc_now(), finishedAt=None, error=None)
        current_phase = "preflight"
        try:
            before = self.adapter.read_inventory(spu_id)
            if before.get("fingerprint") != plan["inventory"]["fingerprint"]:
                raise BridgeConflictError("图集已变化，请重新读取并审核后创建新计划")
            self.repository.append_ledger(plan_id, "preflight", "pass", "门店身份、SPU 与完整图集指纹一致")

            current_phase = "snapshot"
            snapshot_path = self.repository.plan_dir(plan_id) / "snapshot_before.json"
            snapshot_path.write_text(json.dumps(before, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
            self.repository.append_ledger(plan_id, "snapshot", "pass", "写前完整图集快照已保存")

            current_phase = "upload"
            uploaded_urls: dict[str, str] = {}
            for output in plan["outputs"]:
                slot_id = output["slotId"]
                asset = output["outputAsset"]
                path = self.repository.asset_path(plan_id, asset["file"])
                uploaded = self.adapter.upload_image(path, asset["mime"], path.name)
                if uploaded.get("readbackOk") is not True or uploaded.get("bytes") != uploaded.get("readbackBytes"):
                    raise RuntimeError(f"{slot_id} 上传回读字节不一致")
                uploaded_urls[slot_id] = uploaded["url"]
                self.repository.append_ledger(plan_id, "upload", "pass", f"{slot_id} 上传并回读 {uploaded['bytes']}B 一致")

            desired = build_desired_gallery(plan, uploaded_urls)
            current_phase = "write"
            write_result = self.adapter.write_gallery(spu_id, desired, before)
            self.repository.append_ledger(plan_id, "write", "pass", f"完整图集写入已提交：{write_result.get('message', write_result.get('code', 'ok'))}")

            current_phase = "verify"
            verification = self.adapter.verify_gallery(spu_id, desired)
            if verification.get("exact") is not True:
                raise BridgeConflictError("写后 fresh-fetch 图集与计划不一致")
            (self.repository.plan_dir(plan_id) / "snapshot_after.json").write_text(
                json.dumps(verification.get("inventory", {}), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            self.repository.append_ledger(plan_id, "verify", "pass", "写后 fresh-fetch 三类图集逐项 exact 一致")
            self.repository.update_state(plan_id, status="succeeded", finishedAt=utc_now(), error=None)
            return self.repository.load_state(plan_id)
        except Exception as exc:
            message = str(exc) or exc.__class__.__name__
            self.repository.append_ledger(plan_id, current_phase, "fail", message)
            self.repository.update_state(plan_id, status="failed", finishedAt=utc_now(), error=message)
            raise
        finally:
            self._active_plan_id = None
