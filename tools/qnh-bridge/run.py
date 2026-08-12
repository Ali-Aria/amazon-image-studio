#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from qnh_bridge.adapters import FakeQnhAdapter, RealQnhAdapter  # noqa: E402
from qnh_bridge.domain import normalize_bridge_config  # noqa: E402
from qnh_bridge.server import create_http_server  # noqa: E402
from qnh_bridge.service import BridgeService  # noqa: E402


def load_config(path: str) -> dict:
    config_path = pathlib.Path(path).expanduser().resolve()
    with config_path.open(encoding="utf-8") as handle:
        raw = json.load(handle)
    config = normalize_bridge_config(raw)
    config["_configPath"] = str(config_path)
    return config


def create_adapter(config: dict):
    if config["mode"] == "fake":
        return FakeQnhAdapter(config)
    return RealQnhAdapter(config)


def main() -> int:
    parser = argparse.ArgumentParser(description="Loopback-only QNH image repair bridge")
    parser.add_argument("--config", default=str(HERE / "config.example.json"))
    args = parser.parse_args()
    config = load_config(args.config)
    service = BridgeService(config, create_adapter(config))
    server = create_http_server(service, config)
    host, port = server.server_address
    print(f"QNH Bridge {config['version']} [{config['mode']}] http://{host}:{port}")
    print(f"Store: {config['storeName']} / tenant {config['tenantId']} / store {config['storeId']}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nQNH Bridge stopped")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
