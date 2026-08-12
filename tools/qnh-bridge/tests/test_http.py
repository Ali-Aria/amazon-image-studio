from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from qnh_bridge.adapters import FakeQnhAdapter  # noqa: E402
from qnh_bridge.server import create_http_server  # noqa: E402
from qnh_bridge.service import BridgeService  # noqa: E402
from fixtures import bridge_config, inventory, plan  # noqa: E402


class BridgeHttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.config = bridge_config(self.temp.name)
        self.config["allowedOrigins"] = ["http://127.0.0.1:5173", "http://localhost:5173"]
        self.service = BridgeService(self.config, FakeQnhAdapter({"fakeInventory": inventory()}))
        self.server = create_http_server(self.service, self.config, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"

    def request(self, method: str, path: str, body=None, origin="http://127.0.0.1:5173"):
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Origin": origin}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=3) as response:
                raw = response.read()
                return response.status, dict(response.headers), json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            try:
                raw = error.read()
                return error.code, dict(error.headers), json.loads(raw) if raw else None
            finally:
                error.close()

    def test_health_inventory_plan_get_and_execute_round_trip(self):
        status, headers, health = self.request("GET", "/v1/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["storeName"], "演练门店")
        self.assertEqual(headers["Access-Control-Allow-Origin"], "http://127.0.0.1:5173")

        status, _, snapshot = self.request("POST", "/v1/inventory", {"spuId": "123456789"})
        self.assertEqual(status, 200)
        self.assertEqual(snapshot["fingerprint"], inventory()["fingerprint"])

        status, _, summary = self.request("POST", "/v1/plans", plan())
        self.assertEqual(status, 201)

        status, _, state = self.request("GET", f"/v1/plans/{summary['planId']}")
        self.assertEqual(status, 200)
        self.assertEqual(state["status"], "planned")

        status, _, result = self.request("POST", f"/v1/plans/{summary['planId']}/execute", {
            "confirmationPhrase": summary["confirmationPhrase"],
        })
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "succeeded")

    def test_disallowed_origin_is_rejected_without_cors_reflection(self):
        status, headers, body = self.request("GET", "/v1/health", origin="https://evil.example")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertIn("Origin", body["error"])

    def test_options_allows_only_fixed_json_methods_and_headers(self):
        status, headers, _ = self.request("OPTIONS", "/v1/inventory", origin="http://localhost:5173")
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "http://localhost:5173")
        self.assertIn("POST", headers["Access-Control-Allow-Methods"])
        self.assertEqual(headers["Access-Control-Allow-Headers"], "Content-Type")

    def test_unknown_routes_and_non_json_bodies_fail_closed(self):
        status, _, _ = self.request("GET", "/v1/proxy?url=https://example.com")
        self.assertEqual(status, 404)

        request = urllib.request.Request(
            self.base + "/v1/inventory",
            data=b"not-json",
            headers={"Origin": "http://127.0.0.1:5173", "Content-Type": "application/json"},
            method="POST",
        )
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request, timeout=3)
        self.assertEqual(caught.exception.code, 400)
        caught.exception.close()

    def test_request_body_limit_is_enforced_before_json_parse(self):
        self.server.RequestHandlerClass.bridge_config["maxRequestBytes"] = 8
        status, _, body = self.request("POST", "/v1/inventory", {"spuId": "123456789"})
        self.assertEqual(status, 413)
        self.assertIn("过大", body["error"])

    def test_server_refuses_a_non_loopback_bind_configuration(self):
        bad = {**self.config, "bindHost": "0.0.0.0"}
        with self.assertRaisesRegex(ValueError, "127.0.0.1"):
            create_http_server(self.service, bad, port=0)


if __name__ == "__main__":
    unittest.main()
