from __future__ import annotations

import copy
import datetime as dt
import hashlib
import importlib.util
import json
import pathlib
import sys
from typing import Protocol

from .domain import sha256_json


class QnhAdapter(Protocol):
    def read_inventory(self, spu_id: str) -> dict: ...

    def upload_image(self, path: pathlib.Path, mime: str, filename: str) -> dict: ...

    def write_gallery(self, spu_id: str, desired: dict, before: dict) -> dict: ...

    def verify_gallery(self, spu_id: str, desired: dict) -> dict: ...


def normalize_inventory_fingerprint(inventory: dict) -> dict:
    value = copy.deepcopy(inventory)
    fingerprint_payload = {
        "spuId": value.get("spuId"),
        "mainImages": value.get("mainImages", []),
        "detailImages": value.get("detailImages", []),
        "specialImages": value.get("specialImages", []),
        "customizedMain": bool(value.get("customizedMain")),
        "customizedDetail": bool(value.get("customizedDetail")),
    }
    value["fingerprint"] = sha256_json(fingerprint_payload)
    return value


class FakeQnhAdapter:
    def __init__(self, config: dict):
        inventory = config.get("fakeInventory")
        if not isinstance(inventory, dict):
            raise ValueError("fake 模式必须配置 fakeInventory")
        self._inventory = normalize_inventory_fingerprint(inventory)

    def set_inventory(self, inventory: dict) -> None:
        self._inventory = normalize_inventory_fingerprint(inventory)

    def read_inventory(self, spu_id: str) -> dict:
        if str(self._inventory.get("spuId")) != str(spu_id):
            raise ValueError("fakeInventory 中没有该 SPU")
        return copy.deepcopy(self._inventory)

    def upload_image(self, path: pathlib.Path, mime: str, filename: str) -> dict:
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        return {
            "url": f"https://fake-upload.local/{digest}/{filename}",
            "bytes": len(raw),
            "readbackBytes": len(raw),
            "readbackOk": True,
            "mime": mime,
        }

    def write_gallery(self, spu_id: str, desired: dict, before: dict) -> dict:
        if str(self._inventory.get("spuId")) != str(spu_id):
            raise ValueError("fakeInventory 中没有该 SPU")
        self._inventory["mainImages"] = [
            {"id": f"main:{index}", "kind": "main", "index": index, "url": url}
            for index, url in enumerate(desired["main"])
        ]
        self._inventory["detailImages"] = [
            {"id": f"detail:{index}", "kind": "detail", "index": index, "url": url}
            for index, url in enumerate(desired["detail"])
        ]
        groups = []
        previous = {str(item["pictureType"]): item for item in before["specialImages"]}
        for picture_type, urls in desired["special"].items():
            source = previous.get(str(picture_type), {})
            groups.append({
                "pictureType": int(picture_type),
                "label": source.get("label", f"特殊图 {picture_type}"),
                "required": bool(source.get("required")),
                "images": [
                    {"id": f"special:{picture_type}:{index}", "kind": "special", "index": index, "pictureType": int(picture_type), "url": url}
                    for index, url in enumerate(urls)
                ],
            })
        self._inventory["specialImages"] = groups
        self._inventory["customizedMain"] = True
        self._inventory["customizedDetail"] = True
        self._inventory["fingerprint"] = ""
        self._inventory = normalize_inventory_fingerprint(self._inventory)
        return {"code": 0, "message": "fake write accepted"}

    def verify_gallery(self, spu_id: str, desired: dict) -> dict:
        fresh = self.read_inventory(spu_id)
        actual = {
            "main": [item["url"] for item in fresh["mainImages"]],
            "detail": [item["url"] for item in fresh["detailImages"]],
            "special": {
                str(group["pictureType"]): [item["url"] for item in group["images"]]
                for group in fresh["specialImages"]
            },
        }
        exact = actual == desired
        return {"exact": exact, "actual": actual, "inventory": fresh}


INVENTORY_JS = r"""
  // QNH_BRIDGE_INVENTORY
  const SPU=%(spu)s;
  const d=await det(SPU); assertScope(d);
  return {
    productName:d.spuName||'',
    mainUrls:(d.picInfoList||[]).filter(p=>!p.isDelete).map(p=>p.picUrl),
    detailUrls:(d.pictureContents||[]).slice(),
    special:(d.mtSpecialPictureList||[]).map(p=>({
      pictureType:Number(p.pictureType),
      label:p.pictureName||p.pictureTypeName||p.name||('特殊图 '+p.pictureType),
      required:Boolean(p.isRequired??p.required??p.must??p.requiredFlag),
      urls:(p.pictureUrl||[]).slice()
    })),
    customizedMain:Boolean(d.customizedPicFlag),
    customizedDetail:Boolean(d.customizedPicContentFlag)
  };
"""


WRITE_JS = r"""
  // QNH_BRIDGE_WRITE
  const SPU=%(spu)s, EXPECTED=%(expected)s, DESIRED=%(desired)s;
  const d=await det(SPU); assertScope(d);
  const current={
    main:(d.picInfoList||[]).filter(p=>!p.isDelete).map(p=>p.picUrl),
    detail:(d.pictureContents||[]).slice(),
    special:(d.mtSpecialPictureList||[]).map(p=>({
      pictureType:Number(p.pictureType), urls:(p.pictureUrl||[]).slice()
    }))
  };
  if(JSON.stringify(current)!==JSON.stringify(EXPECTED)) {
    throw new Error('写前完整图集已变化,中止');
  }
  if(!Array.isArray(DESIRED.main)||DESIRED.main.length<1) {
    throw new Error('结果无主图,中止');
  }
  const body=updateBody(d);
  body.storeSpu.customizedPicUrlListFlag=true;
  body.storeSpu.customizedPicUrlList=DESIRED.main.slice();
  body.storeSpu.customizedPicContentListFlag=true;
  body.storeSpu.customizedPicContentList=DESIRED.detail.slice();
  const specialList=d.mtSpecialPictureList||[];
  const found=new Set();
  for(const entry of specialList) {
    const key=String(Number(entry.pictureType));
    if(!Object.prototype.hasOwnProperty.call(DESIRED.special,key)) {
      throw new Error('计划缺少特殊图槽位 '+key);
    }
    entry.pictureUrl=DESIRED.special[key].slice();
    entry.customized=true;
    found.add(key);
  }
  for(const key of Object.keys(DESIRED.special)) {
    if(!found.has(key)) throw new Error('商品实况缺少特殊图槽位 '+key);
  }
  body.storeSpu.mtSpecialPictureList=specialList;
  const up=await post(%(update_api)s,body);
  return {code:up.code,message:up.msg||up.message||''};
"""


def _utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _load_pipeline_module(root: pathlib.Path):
    module_path = root / "bin" / "qnhimg.py"
    if not module_path.is_file():
        raise ValueError(f"pipelineRoot 下找不到 bin/qnhimg.py: {module_path}")
    module_name = f"qnh_bridge_external_{hashlib.sha256(str(module_path).encode()).hexdigest()[:12]}"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    if not spec or not spec.loader:
        raise ValueError(f"无法加载 qnhimg.py: {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except SystemExit as exc:
        raise ValueError(f"加载 qnhimg.py 失败: {exc}") from exc
    return module


class RealQnhAdapter:
    """Adapter around the production-proven qnhimg Pipeline and upload readback."""

    def __init__(self, config: dict, pipeline_module=None):
        root_value = config.get("pipelineRoot")
        qnh_config_value = config.get("qnhConfig")
        if not isinstance(root_value, str) or not root_value.strip():
            raise ValueError("real 模式缺少 pipelineRoot")
        if not isinstance(qnh_config_value, str) or not qnh_config_value.strip():
            raise ValueError("real 模式缺少 qnhConfig")
        self.pipeline_root = pathlib.Path(root_value).expanduser().resolve()
        module_path = self.pipeline_root / "bin" / "qnhimg.py"
        if not module_path.is_file():
            raise ValueError(f"pipelineRoot 下找不到 bin/qnhimg.py: {module_path}")
        self.qnh_config_path = pathlib.Path(qnh_config_value).expanduser().resolve()
        if not self.qnh_config_path.is_file():
            raise ValueError(f"qnhConfig 不存在: {self.qnh_config_path}")
        try:
            qnh_config = json.loads(self.qnh_config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise ValueError(f"qnhConfig 无法读取: {exc}") from exc
        expected = {
            "name": str(config.get("storeName", "")),
            "tenantId": str(config.get("tenantId", "")),
            "storeId": str(config.get("storeId", "")),
        }
        actual = {key: str(qnh_config.get(key, "")) for key in expected}
        if actual != expected:
            raise ValueError(f"Bridge 与 qnhConfig 门店身份不一致: expected={expected}, actual={actual}")
        for key in ("cdpPort", "origin", "outDir"):
            if key not in qnh_config:
                raise ValueError(f"qnhConfig 缺少 {key}")
        self.module = pipeline_module or _load_pipeline_module(self.pipeline_root)
        try:
            self.pipeline = self.module.Pipeline(str(self.qnh_config_path))
        except SystemExit as exc:
            raise ValueError(f"初始化 QNH Pipeline 失败: {exc}") from exc
        self.update_api = getattr(self.module, "UPDATE_API", "/qnh-gw3/api/product/store/update")

    def read_inventory(self, spu_id: str) -> dict:
        if not isinstance(spu_id, str) or not spu_id.isdigit():
            raise ValueError("SPU ID 必须是数字字符串")
        result = self.pipeline.run(INVENTORY_JS % {"spu": json.dumps(spu_id)}, timeout=90)
        if not isinstance(result, dict):
            raise RuntimeError("QNH inventory 返回格式无效")
        main_urls = result.get("mainUrls")
        detail_urls = result.get("detailUrls")
        special_raw = result.get("special")
        if not isinstance(main_urls, list) or not all(isinstance(url, str) and url for url in main_urls):
            raise RuntimeError("QNH 主图列表返回格式无效")
        if not isinstance(detail_urls, list) or not all(isinstance(url, str) and url for url in detail_urls):
            raise RuntimeError("QNH 详情图列表返回格式无效")
        if not isinstance(special_raw, list):
            raise RuntimeError("QNH 特殊图列表返回格式无效")
        special_groups = []
        seen_types: set[int] = set()
        for raw in special_raw:
            if not isinstance(raw, dict) or not isinstance(raw.get("pictureType"), int):
                raise RuntimeError("QNH 特殊图槽位返回格式无效")
            picture_type = raw["pictureType"]
            if picture_type in seen_types:
                raise RuntimeError("QNH 特殊图 pictureType 重复")
            seen_types.add(picture_type)
            urls = raw.get("urls", [])
            if not isinstance(urls, list) or not all(isinstance(url, str) and url for url in urls):
                raise RuntimeError("QNH 特殊图 URL 列表返回格式无效")
            special_groups.append({
                "pictureType": picture_type,
                "label": raw.get("label") if isinstance(raw.get("label"), str) and raw["label"] else f"特殊图 {picture_type}",
                "required": bool(raw.get("required")),
                "images": [
                    {"id": f"special:{picture_type}:{index}", "kind": "special", "index": index, "pictureType": picture_type, "url": url}
                    for index, url in enumerate(urls)
                ],
            })
        inventory = {
            "spuId": spu_id,
            "productName": result.get("productName") if isinstance(result.get("productName"), str) else "",
            "mainImages": [
                {"id": f"main:{index}", "kind": "main", "index": index, "url": url}
                for index, url in enumerate(main_urls)
            ],
            "detailImages": [
                {"id": f"detail:{index}", "kind": "detail", "index": index, "url": url}
                for index, url in enumerate(detail_urls)
            ],
            "specialImages": special_groups,
            "customizedMain": bool(result.get("customizedMain")),
            "customizedDetail": bool(result.get("customizedDetail")),
            "fetchedAt": _utc_now(),
        }
        return normalize_inventory_fingerprint(inventory)

    def upload_image(self, path: pathlib.Path, mime: str, filename: str) -> dict:
        if mime not in {"image/png", "image/jpeg"}:
            raise RuntimeError("真实 QNH 上传仅允许已实跑验证的 PNG 或 JPEG")
        if not path.is_file():
            raise RuntimeError("计划图片资产不存在")
        try:
            url, byte_count = self.module.upload_file(self.pipeline, str(path), filename)
        except SystemExit as exc:
            raise RuntimeError(str(exc) or "QNH 上传失败") from exc
        if not isinstance(url, str) or not url or not isinstance(byte_count, int):
            raise RuntimeError("QNH 上传回读结果无效")
        actual_bytes = path.stat().st_size
        if byte_count != actual_bytes:
            raise RuntimeError(f"QNH 上传回读字节不符: {actual_bytes} -> {byte_count}")
        return {
            "url": url,
            "bytes": actual_bytes,
            "readbackBytes": byte_count,
            "readbackOk": True,
            "mime": mime,
        }

    @staticmethod
    def _gallery_from_inventory(inventory: dict) -> dict:
        return {
            "main": [item["url"] for item in inventory["mainImages"]],
            "detail": [item["url"] for item in inventory["detailImages"]],
            "special": [
                {"pictureType": group["pictureType"], "urls": [item["url"] for item in group["images"]]}
                for group in inventory["specialImages"]
            ],
        }

    def write_gallery(self, spu_id: str, desired: dict, before: dict) -> dict:
        expected = self._gallery_from_inventory(before)
        body = WRITE_JS % {
            "spu": json.dumps(spu_id),
            "expected": json.dumps(expected, ensure_ascii=False, separators=(",", ":")),
            "desired": json.dumps(desired, ensure_ascii=False, separators=(",", ":")),
            "update_api": json.dumps(self.update_api),
        }
        result = self.pipeline.run(body, timeout=180)
        if not isinstance(result, dict):
            raise RuntimeError("QNH 写入返回格式无效")
        if result.get("code") != 0:
            raise RuntimeError(result.get("message") or f"QNH 写入失败 code={result.get('code')}")
        return result

    def verify_gallery(self, spu_id: str, desired: dict) -> dict:
        fresh = self.read_inventory(spu_id)
        actual_gallery = self._gallery_from_inventory(fresh)
        actual = {
            "main": actual_gallery["main"],
            "detail": actual_gallery["detail"],
            "special": {str(group["pictureType"]): group["urls"] for group in actual_gallery["special"]},
        }
        return {"exact": actual == desired, "actual": actual, "inventory": fresh}
