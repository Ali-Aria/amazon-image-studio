#!/usr/bin/env python3
"""从主档资料商品池 xlsx 构建条码/SKU 商品索引资产。

产物：public/knowledge/product-index/v1/<shard>.json + index.meta.json
分片键：查询键（条码或 sku_id）末两位，共 100 片，前端按需懒加载单片。

用法：
    python3 scripts/build_retail_product_index.py <商品池.xlsx> [输出目录]
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

SHARD_COUNT = 100
MAX_ATTRIBUTES = 8
MAX_ATTRIBUTE_VALUE = 24
ATTRIBUTE_PATTERN = re.compile(r"【([^：】]{1,20})[：:]([^】]{0,200})】")
# 只保留能直接上图或直接填资料的销售属性，避免把厂商地址、证书编号等长文本带进前端。
ATTRIBUTE_DENY = re.compile(
    r"(证书|编号|条形码|条码|生产者|制造商|地址|电话|授权|备案|执行标准|许可证|批号|工厂|经销商|进口商)"
)


def cell(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"none", "nan", "null"} else text


def count_images(value) -> int:
    text = cell(value)
    if not text:
        return 0
    try:
        parsed = json.loads(text)
    except (ValueError, TypeError):
        return 0
    if isinstance(parsed, list):
        total = 0
        for entry in parsed:
            if isinstance(entry, str):
                total += 1
            elif isinstance(entry, dict):
                urls = entry.get("pictureUrl")
                total += len(urls) if isinstance(urls, list) else 1
        return total
    return 0


def parse_attributes(value) -> dict[str, str]:
    text = cell(value)
    if not text:
        return {}
    attributes: dict[str, str] = {}
    for key, raw in ATTRIBUTE_PATTERN.findall(text):
        key = key.strip()
        raw = raw.strip()
        if not key or not raw or ATTRIBUTE_DENY.search(key):
            continue
        if len(raw) > MAX_ATTRIBUTE_VALUE or key in attributes:
            continue
        attributes[key] = raw
        if len(attributes) >= MAX_ATTRIBUTES:
            break
    return attributes


def completeness(record: dict) -> tuple[int, str]:
    score = sum(1 for key in ("n", "b", "s", "u", "w", "mc", "ec") if record.get(key))
    score += min(len(record.get("a") or {}), 6)
    score += 1 if record.get("im") else 0
    return score, record.get("_t", "")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build(source: Path, out_dir: Path) -> None:
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
    sheet = workbook[workbook.sheetnames[0]]
    rows = sheet.iter_rows(values_only=True)
    header = [cell(name) for name in next(rows)]
    column = {name: index for index, name in enumerate(header)}

    def get(row, name: str):
        index = column.get(name)
        return row[index] if index is not None and index < len(row) else None

    best: dict[str, dict] = {}
    scanned = 0
    skipped_deleted = 0

    for row in rows:
        scanned += 1
        if cell(get(row, "is_deleted")) == "1":
            skipped_deleted += 1
            continue
        name = cell(get(row, "good_name"))
        if not name:
            continue
        barcode = cell(get(row, "upc_code"))
        sku_id = cell(get(row, "sku_id"))
        weight = cell(get(row, "weight"))
        weight_unit = cell(get(row, "weight_unit"))
        record = {
            "n": name,
            "b": cell(get(row, "brand_name")),
            "s": cell(get(row, "sale_specification")),
            "u": cell(get(row, "sale_unit")),
            "w": f"{weight}{weight_unit}" if weight and weight_unit else weight,
            "mc": cell(get(row, "mt_category_name_path")),
            "ec": cell(get(row, "eleme_category_name_path")),
            "a": parse_attributes(get(row, "mt_category_attribute")),
            "im": count_images(get(row, "main_images")),
            "id": count_images(get(row, "detail_images")),
            "is": count_images(get(row, "mt_special_images")),
            "t": cell(get(row, "spec_type")),
            "bc": barcode,
            "sk": sku_id,
            "_t": cell(get(row, "update_time")),
        }
        # 只用条码做查询键：门店实际能扫到/抄到的就是条码，sku_id 是租户内部 id，
        # 加进来会让分片体积翻倍却几乎没人会输入。
        if not barcode:
            continue
        current = best.get(barcode)
        if current is None or completeness(record) > completeness(current):
            best[barcode] = record

    shards: dict[str, dict[str, dict]] = defaultdict(dict)
    for key, record in best.items():
        payload = {field: value for field, value in record.items() if field != "_t" and value}
        shards[key[-2:].rjust(2, "0")][key] = payload

    target = out_dir / "v1"
    target.mkdir(parents=True, exist_ok=True)
    for existing in target.glob("*.json"):
        existing.unlink()
    for shard, items in shards.items():
        (target / f"{shard}.json").write_text(
            json.dumps({"v": 1, "items": items}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )

    meta = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sourceFile": source.name,
        "sourceBytes": source.stat().st_size,
        "sourceSha256": file_sha256(source),
        "rowsScanned": scanned,
        "rowsDeletedSkipped": skipped_deleted,
        "keyCount": len(best),
        "shardCount": len(shards),
        "shardKeyLength": 2,
    }
    (out_dir / "index.meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(meta, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("用法：build_retail_product_index.py <商品池.xlsx> [输出目录]")
    source_path = Path(sys.argv[1]).expanduser()
    output_path = Path(sys.argv[2]).expanduser() if len(sys.argv) > 2 else (
        Path(__file__).resolve().parent.parent / "public" / "knowledge" / "product-index"
    )
    build(source_path, output_path)
