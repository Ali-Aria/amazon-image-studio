from __future__ import annotations

import base64
import copy
import hashlib
import json

PNG_BYTES = b"\x89PNG\r\n\x1a\nfixture-image"
PNG_DATA_URL = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode("ascii")
PNG_DATA_URL_2 = "data:image/png;base64," + base64.b64encode(PNG_BYTES + b"-two").decode("ascii")
PNG_DATA_URL_3 = "data:image/png;base64," + base64.b64encode(PNG_BYTES + b"-three").decode("ascii")


def bridge_config(data_dir: str) -> dict:
    return {
        "version": "1.0.0",
        "mode": "fake",
        "bindHost": "127.0.0.1",
        "port": 8768,
        "storeName": "演练门店",
        "tenantId": "1013857",
        "storeId": "1312360",
        "dataDir": data_dir,
        "maxImageBytes": 1024 * 1024,
        "maxRequestBytes": 8 * 1024 * 1024,
        "allowedOrigins": ["http://127.0.0.1:5173"],
    }


def _fingerprint(value: dict) -> str:
    payload = {
        "spuId": value["spuId"],
        "mainImages": value["mainImages"],
        "detailImages": value["detailImages"],
        "specialImages": value["specialImages"],
        "customizedMain": value["customizedMain"],
        "customizedDetail": value["customizedDetail"],
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def inventory() -> dict:
    value = {
        "spuId": "123456789",
        "productName": "测试商品 500ml",
        "mainImages": [
            {"id": "main:0", "kind": "main", "index": 0, "url": "https://img.example/main-0.jpg"},
            {"id": "main:1", "kind": "main", "index": 1, "url": "https://img.example/main-1.jpg"},
        ],
        "detailImages": [
            {"id": "detail:0", "kind": "detail", "index": 0, "url": "https://img.example/detail-0.jpg"},
        ],
        "specialImages": [
            {
                "pictureType": 22,
                "label": "选购指南图",
                "required": True,
                "images": [
                    {"id": "special:22:0", "kind": "special", "index": 0, "pictureType": 22, "url": "https://img.example/special-0.jpg"}
                ],
            },
            {"pictureType": 24, "label": "资质图", "required": False, "images": []},
        ],
        "customizedMain": False,
        "customizedDetail": False,
        "fetchedAt": "2026-08-12T12:00:00Z",
    }
    value["fingerprint"] = _fingerprint(value)
    return value


def _checklist() -> dict:
    return {
        "packagingText": True,
        "brand": True,
        "specification": True,
        "color": True,
        "unitCount": True,
        "structure": True,
    }


def plan() -> dict:
    snap = inventory()
    return {
        "schemaVersion": 1,
        "identity": {"storeName": "演练门店", "tenantId": "1013857", "storeId": "1312360"},
        "product": {"spuId": "123456789", "name": "测试商品 500ml", "barcode": "6900000000000", "sku": "SKU-001"},
        "inventory": {
            "fingerprint": snap["fingerprint"],
            "fetchedAt": snap["fetchedAt"],
            "mainImages": copy.deepcopy(snap["mainImages"]),
            "detailImages": copy.deepcopy(snap["detailImages"]),
            "specialImages": copy.deepcopy(snap["specialImages"]),
            "customizedMain": snap["customizedMain"],
            "customizedDetail": snap["customizedDetail"],
            "decisions": [
                {**copy.deepcopy(snap["mainImages"][0]), "imageId": "main:0", "decision": "keep", "reason": ""},
                {**copy.deepcopy(snap["mainImages"][1]), "imageId": "main:1", "decision": "remove", "reason": "其他平台水印"},
                {**copy.deepcopy(snap["detailImages"][0]), "imageId": "detail:0", "decision": "keep", "reason": ""},
                {**copy.deepcopy(snap["specialImages"][0]["images"][0]), "imageId": "special:22:0", "decision": "remove", "reason": "与当前商品不一致"},
            ],
        },
        "outputs": [
            {
                "slotId": "01-main",
                "target": "main",
                "pictureType": None,
                "sourceImageId": "source-a",
                "outputImageId": "output-a",
                "sourceRole": "product",
                "processingMode": "ai",
                "verdict": "pass",
                "checklist": _checklist(),
                "note": "逐项核对一致",
                "sourceDataUrl": PNG_DATA_URL,
                "outputDataUrl": PNG_DATA_URL_3,
            },
            {
                "slotId": "08-special",
                "target": "special",
                "pictureType": 22,
                "sourceImageId": "source-a",
                "outputImageId": "output-special",
                "sourceRole": "product",
                "processingMode": "deterministic",
                "verdict": "pass",
                "checklist": _checklist(),
                "note": "字段来自主档",
                "sourceDataUrl": PNG_DATA_URL,
                "outputDataUrl": PNG_DATA_URL_2,
            },
        ],
        "detachAcknowledged": True,
        "createdAt": "2026-08-12T12:05:00Z",
    }
