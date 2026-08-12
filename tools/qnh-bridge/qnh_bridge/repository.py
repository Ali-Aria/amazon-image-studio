from __future__ import annotations

import datetime as dt
import copy
import hashlib
import json
import os
import pathlib
import tempfile
from typing import Any

from .domain import canonical_json


class PlanNotFoundError(FileNotFoundError):
    pass


class PlanConflictError(RuntimeError):
    pass


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _atomic_json(path: pathlib.Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    finally:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)


class PlanRepository:
    def __init__(self, data_dir: str):
        self.root = pathlib.Path(data_dir).expanduser().resolve()
        self.plans_dir = self.root / "plans"
        self.plans_dir.mkdir(parents=True, exist_ok=True)

    def _validate_id(self, plan_id: str) -> str:
        if not isinstance(plan_id, str) or not plan_id.startswith("qnh-") or len(plan_id) != 20:
            raise PlanNotFoundError("计划不存在")
        suffix = plan_id[4:]
        if any(character not in "0123456789abcdef" for character in suffix):
            raise PlanNotFoundError("计划不存在")
        return plan_id

    def plan_dir(self, plan_id: str) -> pathlib.Path:
        return self.plans_dir / self._validate_id(plan_id)

    def create(self, normalized_plan: dict, assets: list[dict]) -> dict:
        plan_body = copy.deepcopy(normalized_plan)
        asset_by_key = {asset["key"]: asset for asset in assets}
        if len(asset_by_key) != len(assets):
            raise PlanConflictError("计划图片资产 key 重复")
        for output in plan_body["outputs"]:
            for field in ("sourceAsset", "outputAsset"):
                asset = asset_by_key.get(output[field]["key"])
                if not asset:
                    raise PlanConflictError("计划图片资产缺失")
                output[field]["file"] = f"assets/{asset['sha256']}.{asset['extension']}"
        digest = hashlib.sha256(canonical_json(plan_body).encode("utf-8")).hexdigest()
        plan_id = f"qnh-{digest[:16]}"
        directory = self.plan_dir(plan_id)
        plan_path = directory / "plan.json"
        manifest = {**plan_body, "planId": plan_id, "sha256": digest}
        if directory.exists():
            if not plan_path.is_file():
                raise PlanConflictError("不可变计划目录已存在但不完整")
            existing = json.loads(plan_path.read_text(encoding="utf-8"))
            if existing != manifest:
                raise PlanConflictError("不可变计划内容冲突")
            return self.summary(plan_id)
        try:
            directory.mkdir(parents=False, exist_ok=False)
            assets_dir = directory / "assets"
            assets_dir.mkdir()
            written_paths: set[str] = set()
            for asset in assets:
                filename = f"{asset['sha256']}.{asset['extension']}"
                if filename not in written_paths:
                    path = assets_dir / filename
                    path.write_bytes(asset["bytes"])
                    written_paths.add(filename)
            _atomic_json(plan_path, manifest)
            _atomic_json(directory / "state.json", {
                "planId": plan_id,
                "status": "planned",
                "createdAt": utc_now(),
                "startedAt": None,
                "finishedAt": None,
                "error": None,
            })
        except Exception:
            if directory.exists() and not plan_path.exists():
                for path in sorted(directory.rglob("*"), reverse=True):
                    if path.is_file():
                        path.unlink()
                    elif path.is_dir():
                        path.rmdir()
                directory.rmdir()
            raise
        return self.summary(plan_id)

    def load_plan(self, plan_id: str) -> dict:
        path = self.plan_dir(plan_id) / "plan.json"
        if not path.is_file():
            raise PlanNotFoundError("计划不存在")
        return json.loads(path.read_text(encoding="utf-8"))

    def load_state(self, plan_id: str) -> dict:
        path = self.plan_dir(plan_id) / "state.json"
        if not path.is_file():
            raise PlanNotFoundError("计划状态不存在")
        state = json.loads(path.read_text(encoding="utf-8"))
        ledger_path = self.plan_dir(plan_id) / "ledger.jsonl"
        ledger = []
        if ledger_path.is_file():
            for line in ledger_path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    ledger.append(json.loads(line))
        return {**state, "ledger": ledger}

    def update_state(self, plan_id: str, **patch: Any) -> dict:
        state = self.load_state(plan_id)
        state.pop("ledger", None)
        state.update(patch)
        _atomic_json(self.plan_dir(plan_id) / "state.json", state)
        return self.load_state(plan_id)

    def append_ledger(self, plan_id: str, phase: str, status: str, message: str) -> dict:
        if status not in {"info", "pass", "fail"}:
            raise ValueError("无效台账状态")
        record = {"ts": utc_now(), "phase": phase, "status": status, "message": message}
        path = self.plan_dir(plan_id) / "ledger.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        return record

    def summary(self, plan_id: str) -> dict:
        plan = self.load_plan(plan_id)
        state = self.load_state(plan_id)
        outputs = plan["outputs"]
        removed = sum(item["decision"] == "remove" for item in plan["inventory"]["decisions"])
        return {
            "planId": plan_id,
            "sha256": plan["sha256"],
            "confirmationPhrase": f"确认执行 {plan['sha256'][:6].upper()}",
            "addedMain": sum(item["target"] == "main" for item in outputs),
            "addedDetail": sum(item["target"] == "detail" for item in outputs),
            "addedSpecial": sum(item["target"] == "special" for item in outputs),
            "removed": removed,
            "status": state["status"],
        }

    def asset_path(self, plan_id: str, relative_path: str) -> pathlib.Path:
        directory = self.plan_dir(plan_id)
        path = (directory / relative_path).resolve()
        if directory not in path.parents or not path.is_file():
            raise PlanNotFoundError("计划图片资产不存在")
        return path
