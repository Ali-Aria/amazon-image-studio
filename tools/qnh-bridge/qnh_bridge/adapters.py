from __future__ import annotations

import copy
import hashlib
import pathlib
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
    value["fingerprint"] = value.get("fingerprint") or sha256_json(fingerprint_payload)
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
