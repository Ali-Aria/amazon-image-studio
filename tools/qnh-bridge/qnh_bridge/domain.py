from __future__ import annotations

import base64
import binascii
import copy
import hashlib
import json
import os
import re
from typing import Any


class PlanValidationError(ValueError):
    """A plan or bridge configuration failed closed validation."""


ALLOWED_MIMES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
VALID_SLOTS = {
    "01-main",
    "02-front",
    "03-selling-points",
    "04-detail",
    "05-scene",
    "06-specification",
    "07-detail-page",
    "08-special",
}
CHECKLIST_KEYS = (
    "packagingText",
    "brand",
    "specification",
    "color",
    "unitCount",
    "structure",
)
DOCUMENT_ROLES = {"authentic_document", "back_label"}
SOURCE_ROLES = {"product", "back_label", "gift_pack", "authentic_document"}
PROCESSING_MODES = {"ai", "deterministic", "ai-preserve", "source-only"}
SLOT_TARGETS = {
    "01-main": "main",
    "02-front": "main",
    "03-selling-points": "main",
    "04-detail": "main",
    "05-scene": "main",
    "06-specification": "main",
    "07-detail-page": "detail",
    "08-special": "special",
}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _record(value: Any, label: str) -> dict:
    if not isinstance(value, dict):
        raise PlanValidationError(f"{label} 必须是对象")
    return value


def _string(value: Any, label: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        raise PlanValidationError(f"{label} 必须是非空字符串")
    return value.strip()


def _integer(value: Any, label: str, *, minimum: int = 0) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
        raise PlanValidationError(f"{label} 必须是大于等于 {minimum} 的整数")
    return value


def normalize_bridge_config(raw: Any) -> dict:
    config = _record(raw, "Bridge 配置")
    required = ("version", "mode", "bindHost", "port", "storeName", "tenantId", "storeId", "dataDir")
    for key in required:
        if key not in config:
            raise PlanValidationError(f"Bridge 配置缺少 {key}")
    if config["bindHost"] != "127.0.0.1":
        raise PlanValidationError("Bridge 只能绑定 127.0.0.1")
    mode = _string(config["mode"], "mode")
    if mode not in {"fake", "real"}:
        raise PlanValidationError("mode 只能是 fake 或 real")
    allowed_origins = config.get("allowedOrigins", [])
    if not isinstance(allowed_origins, list) or any(not isinstance(item, str) for item in allowed_origins):
        raise PlanValidationError("allowedOrigins 必须是字符串数组")
    for origin in allowed_origins:
        if not re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):\d+", origin):
            raise PlanValidationError("allowedOrigins 只能包含本机 HTTP 开发源")
    normalized = {
        **config,
        "version": _string(config["version"], "version"),
        "mode": mode,
        "bindHost": "127.0.0.1",
        "port": _integer(config["port"], "port", minimum=1),
        "storeName": _string(config["storeName"], "storeName"),
        "tenantId": _string(config["tenantId"], "tenantId"),
        "storeId": _string(config["storeId"], "storeId"),
        "dataDir": os.path.abspath(os.path.expanduser(_string(config["dataDir"], "dataDir"))),
        "maxImageBytes": _integer(config.get("maxImageBytes", 10 * 1024 * 1024), "maxImageBytes", minimum=1),
        "maxRequestBytes": _integer(config.get("maxRequestBytes", 80 * 1024 * 1024), "maxRequestBytes", minimum=1),
        "maxMainImages": _integer(config.get("maxMainImages", 10), "maxMainImages", minimum=1),
        "maxDetailImages": _integer(config.get("maxDetailImages", 20), "maxDetailImages", minimum=0),
        "allowedOrigins": allowed_origins,
    }
    return normalized


def _decode_data_url(value: Any, label: str, max_bytes: int) -> dict:
    if not isinstance(value, str):
        raise PlanValidationError(f"{label} 缺少图片 data URL")
    match = re.fullmatch(r"data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)", value)
    if not match or match.group(1) not in ALLOWED_MIMES:
        raise PlanValidationError(f"{label} 仅允许 PNG、JPEG 或 WebP 图片")
    mime = match.group(1)
    try:
        payload = base64.b64decode(match.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise PlanValidationError(f"{label} base64 无效") from exc
    if not payload:
        raise PlanValidationError(f"{label} 不能为空")
    if len(payload) > max_bytes:
        raise PlanValidationError(f"{label} 超过图片大小上限")
    signatures_ok = (
        (mime == "image/png" and payload.startswith(b"\x89PNG\r\n\x1a\n"))
        or (mime == "image/jpeg" and payload.startswith(b"\xff\xd8\xff"))
        or (mime == "image/webp" and len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP")
    )
    if not signatures_ok:
        raise PlanValidationError(f"{label} 文件头与声明 MIME 不一致")
    digest = hashlib.sha256(payload).hexdigest()
    return {"mime": mime, "extension": ALLOWED_MIMES[mime], "bytes": payload, "sha256": digest}


def _snapshot_images(inventory: dict) -> tuple[list[dict], set[int]]:
    images: list[dict] = []
    special_types: set[int] = set()
    for field, kind in (("mainImages", "main"), ("detailImages", "detail")):
        values = inventory.get(field)
        if not isinstance(values, list):
            raise PlanValidationError(f"inventory.{field} 必须是数组")
        for item in values:
            row = copy.deepcopy(_record(item, field))
            if row.get("kind") != kind:
                raise PlanValidationError(f"{field} 图片 kind 不符")
            images.append(row)
    groups = inventory.get("specialImages")
    if not isinstance(groups, list):
        raise PlanValidationError("inventory.specialImages 必须是数组")
    for group in groups:
        special = _record(group, "特殊图槽位")
        picture_type = _integer(special.get("pictureType"), "pictureType")
        if picture_type in special_types:
            raise PlanValidationError("特殊图 pictureType 重复")
        special_types.add(picture_type)
        special_images = special.get("images")
        if not isinstance(special_images, list):
            raise PlanValidationError("特殊图 images 必须是数组")
        for item in special_images:
            row = copy.deepcopy(_record(item, "特殊图图片"))
            if row.get("kind") != "special" or row.get("pictureType") != picture_type:
                raise PlanValidationError("特殊图快照 pictureType 不一致")
            images.append(row)
    for item in images:
        _string(item.get("id"), "快照图片 id")
        _string(item.get("url"), "快照图片 url")
        _integer(item.get("index"), "快照图片 index")
    return images, special_types


def _normalize_decisions(inventory: dict, snapshot_images: list[dict]) -> list[dict]:
    values = inventory.get("decisions")
    if not isinstance(values, list):
        raise PlanValidationError("inventory.decisions 必须是数组")
    by_id = {item["id"]: item for item in snapshot_images}
    if len(by_id) != len(snapshot_images):
        raise PlanValidationError("快照图片 id 重复")
    seen: set[str] = set()
    normalized: list[dict] = []
    for raw in values:
        decision = copy.deepcopy(_record(raw, "图片审核决定"))
        image_id = _string(decision.get("imageId"), "imageId")
        if image_id in seen:
            raise PlanValidationError("图片审核决定重复")
        seen.add(image_id)
        snapshot = by_id.get(image_id)
        if not snapshot:
            raise PlanValidationError("图片审核决定不属于完整快照")
        for field in ("id", "kind", "index", "url", "pictureType"):
            if decision.get(field) != snapshot.get(field):
                raise PlanValidationError("图片审核决定与完整快照不一致")
        verdict = decision.get("decision")
        if verdict not in {"keep", "remove"}:
            raise PlanValidationError("全部现有图片必须选择保留或剔除")
        reason = decision.get("reason", "")
        if not isinstance(reason, str):
            raise PlanValidationError("剔除原因必须是字符串")
        reason = reason.strip()
        if verdict == "remove" and not reason:
            raise PlanValidationError("剔除图片必须填写剔除原因")
        normalized.append({**snapshot, "imageId": image_id, "decision": verdict, "reason": reason})
    if seen != set(by_id):
        raise PlanValidationError("必须审核全部现有图片")
    order = {item["id"]: index for index, item in enumerate(snapshot_images)}
    return sorted(normalized, key=lambda item: order[item["imageId"]])


def _normalize_outputs(values: Any, special_types: set[int], decisions: list[dict], max_bytes: int, mode: str) -> tuple[list[dict], list[dict]]:
    if not isinstance(values, list):
        raise PlanValidationError("outputs 必须是数组")
    outputs: list[dict] = []
    assets: list[dict] = []
    seen_slots: set[str] = set()
    kept_special = {item.get("pictureType") for item in decisions if item["kind"] == "special" and item["decision"] == "keep"}
    for index, raw in enumerate(values):
        item = copy.deepcopy(_record(raw, "拟写入图片"))
        slot_id = _string(item.get("slotId"), "slotId")
        if slot_id not in VALID_SLOTS or slot_id in seen_slots:
            raise PlanValidationError("slotId 无效或重复")
        seen_slots.add(slot_id)
        target = item.get("target")
        if target not in {"main", "detail", "special"}:
            raise PlanValidationError("输出 target 无效")
        if target != SLOT_TARGETS[slot_id]:
            raise PlanValidationError(f"{slot_id} 图位只能写入 {SLOT_TARGETS[slot_id]}")
        if item.get("verdict") != "pass":
            raise PlanValidationError("计划只能包含人工 PASS 图片")
        checklist = _record(item.get("checklist"), "保真核对")
        if any(checklist.get(key) is not True for key in CHECKLIST_KEYS):
            raise PlanValidationError("PASS 图片必须完成全部包装保真核对")
        source_id = _string(item.get("sourceImageId"), "sourceImageId")
        output_id = _string(item.get("outputImageId"), "outputImageId")
        source_role = _string(item.get("sourceRole"), "sourceRole")
        processing = _string(item.get("processingMode"), "processingMode")
        if source_role not in SOURCE_ROLES:
            raise PlanValidationError("来源角色不在允许列表")
        if processing not in PROCESSING_MODES:
            raise PlanValidationError("图片处理模式不在允许列表")
        if source_role in DOCUMENT_ROLES and processing != "source-only":
            raise PlanValidationError("证照或背标只能原图直传，禁止 AI 生成")
        if processing != "source-only" and source_id == output_id:
            raise PlanValidationError("普通成图的真实来源图和输出图不能相同")
        picture_type = item.get("pictureType")
        if target == "special":
            if not isinstance(picture_type, int) or isinstance(picture_type, bool):
                raise PlanValidationError("特殊图必须选择 pictureType")
            if picture_type not in special_types:
                raise PlanValidationError("计划中的特殊图 pictureType 在商品实况中不存在")
            if picture_type in kept_special:
                raise PlanValidationError("该特殊图类型已有图片，必须先明确剔除已有图片")
        elif picture_type is not None:
            raise PlanValidationError("非特殊图不得携带 pictureType")
        source_asset = _decode_data_url(item.pop("sourceDataUrl", None), f"{slot_id} 来源图", max_bytes)
        output_asset = _decode_data_url(item.pop("outputDataUrl", None), f"{slot_id} 输出图", max_bytes)
        if mode == "real" and output_asset["mime"] == "image/webp":
            raise PlanValidationError(f"{slot_id} 真实模式暂只允许 PNG 或 JPEG 输出")
        if processing == "source-only" and source_asset["sha256"] != output_asset["sha256"]:
            raise PlanValidationError("source-only 图片必须与真实来源图字节一致")
        source_key = f"{slot_id}-source"
        output_key = f"{slot_id}-output"
        assets.extend([
            {**source_asset, "key": source_key, "slotId": slot_id, "role": "source"},
            {**output_asset, "key": output_key, "slotId": slot_id, "role": "output"},
        ])
        outputs.append({
            **item,
            "slotId": slot_id,
            "target": target,
            "pictureType": picture_type,
            "sourceImageId": source_id,
            "outputImageId": output_id,
            "sourceRole": source_role,
            "processingMode": processing,
            "verdict": "pass",
            "checklist": {key: True for key in CHECKLIST_KEYS},
            "note": item.get("note", "") if isinstance(item.get("note", ""), str) else "",
            "sourceAsset": {"key": source_key, "mime": source_asset["mime"], "sha256": source_asset["sha256"], "bytes": len(source_asset["bytes"])},
            "outputAsset": {"key": output_key, "mime": output_asset["mime"], "sha256": output_asset["sha256"], "bytes": len(output_asset["bytes"])},
        })
    return outputs, assets


def validate_and_normalize_plan(raw: Any, raw_config: Any) -> tuple[dict, list[dict]]:
    config = normalize_bridge_config(raw_config)
    plan = copy.deepcopy(_record(raw, "计划"))
    if plan.get("schemaVersion") != 1:
        raise PlanValidationError("仅支持 schemaVersion 1")
    identity = _record(plan.get("identity"), "identity")
    expected = {key: config[key] for key in ("storeName", "tenantId", "storeId")}
    actual = {key: identity.get(key) for key in expected}
    if actual != expected:
        raise PlanValidationError("计划门店身份与 Bridge 配置不一致")
    product = _record(plan.get("product"), "product")
    spu_id = _string(product.get("spuId"), "SPU ID")
    if not spu_id.isdigit():
        raise PlanValidationError("SPU ID 必须是数字字符串")
    inventory = _record(plan.get("inventory"), "inventory")
    fingerprint = _string(inventory.get("fingerprint"), "图集指纹")
    fetched_at = _string(inventory.get("fetchedAt"), "图集读取时间")
    snapshot_images, special_types = _snapshot_images(inventory)
    customized_main = inventory.get("customizedMain")
    customized_detail = inventory.get("customizedDetail")
    if not isinstance(customized_main, bool) or not isinstance(customized_detail, bool):
        raise PlanValidationError("图集快照缺少自定义状态")
    embedded_fingerprint = sha256_json({
        "spuId": spu_id,
        "mainImages": inventory["mainImages"],
        "detailImages": inventory["detailImages"],
        "specialImages": inventory["specialImages"],
        "customizedMain": customized_main,
        "customizedDetail": customized_detail,
    })
    if fingerprint != embedded_fingerprint:
        raise PlanValidationError("计划图集指纹与内嵌快照不一致")
    decisions = _normalize_decisions(inventory, snapshot_images)
    outputs, assets = _normalize_outputs(plan.get("outputs"), special_types, decisions, config["maxImageBytes"], config["mode"])
    if plan.get("detachAcknowledged") is not True:
        raise PlanValidationError("必须确认门店级图片与租户主档后续更新解耦")
    if not outputs and all(item["decision"] == "keep" for item in decisions):
        raise PlanValidationError("计划没有任何变更")
    normalized_inventory = {
        "fingerprint": fingerprint,
        "fetchedAt": fetched_at,
        "mainImages": copy.deepcopy(inventory["mainImages"]),
        "detailImages": copy.deepcopy(inventory["detailImages"]),
        "specialImages": copy.deepcopy(inventory["specialImages"]),
        "customizedMain": customized_main,
        "customizedDetail": customized_detail,
        "decisions": decisions,
    }
    normalized = {
        "schemaVersion": 1,
        "identity": expected,
        "product": {
            "spuId": spu_id,
            "name": _string(product.get("name", ""), "商品名称", allow_empty=True),
            "barcode": _string(product.get("barcode", ""), "条码", allow_empty=True),
            "sku": _string(product.get("sku", ""), "货号", allow_empty=True),
        },
        "inventory": normalized_inventory,
        "outputs": outputs,
        "detachAcknowledged": True,
        "createdAt": _string(plan.get("createdAt"), "createdAt"),
    }
    desired_preview = build_desired_gallery(normalized, {item["slotId"]: f"pending://{item['slotId']}" for item in outputs})
    if len(desired_preview["main"]) > config["maxMainImages"]:
        raise PlanValidationError(f"最终主图数量超过主图上限 {config['maxMainImages']}")
    if len(desired_preview["detail"]) > config["maxDetailImages"]:
        raise PlanValidationError(f"最终详情图数量超过详情图上限 {config['maxDetailImages']}")
    return normalized, assets


def build_desired_gallery(plan: dict, uploaded_urls: dict[str, str]) -> dict:
    decisions = plan["inventory"]["decisions"]
    kept_main = [item["url"] for item in decisions if item["kind"] == "main" and item["decision"] == "keep"]
    kept_detail = [item["url"] for item in decisions if item["kind"] == "detail" and item["decision"] == "keep"]
    special = {str(group["pictureType"]): [] for group in plan["inventory"]["specialImages"]}
    for item in decisions:
        if item["kind"] == "special" and item["decision"] == "keep":
            special[str(item["pictureType"])].append(item["url"])
    main_outputs = [uploaded_urls[item["slotId"]] for item in plan["outputs"] if item["target"] == "main"]
    detail_outputs = [uploaded_urls[item["slotId"]] for item in plan["outputs"] if item["target"] == "detail"]
    for item in plan["outputs"]:
        if item["target"] == "special":
            special[str(item["pictureType"])] = [uploaded_urls[item["slotId"]]]
    return {"main": main_outputs + kept_main, "detail": kept_detail + detail_outputs, "special": special}
