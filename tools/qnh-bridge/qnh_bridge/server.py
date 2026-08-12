from __future__ import annotations

import json
import re
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlsplit

from .domain import PlanValidationError, normalize_bridge_config
from .repository import PlanConflictError, PlanNotFoundError
from .service import BridgeBusyError, BridgeConflictError, BridgeService, ConfirmationError


PLAN_GET = re.compile(r"^/v1/plans/(qnh-[a-f0-9]{16})$")
PLAN_EXECUTE = re.compile(r"^/v1/plans/(qnh-[a-f0-9]{16})/execute$")


class BridgeRequestHandler(BaseHTTPRequestHandler):
    bridge_service: BridgeService
    bridge_config: dict

    server_version = "QnhBridge/1.0"
    sys_version = ""

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[qnh-bridge] {self.address_string()} {fmt % args}")

    def _origin(self) -> str | None:
        return self.headers.get("Origin")

    def _origin_allowed(self) -> bool:
        origin = self._origin()
        return origin is None or origin in self.bridge_config["allowedOrigins"]

    def _cors(self) -> None:
        origin = self._origin()
        if origin and origin in self.bridge_config["allowedOrigins"]:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _send(self, status: int, value: Any | None = None) -> None:
        body = b"" if value is None else json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self._cors()
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if body:
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _error(self, status: int, message: str) -> None:
        self._send(status, {"error": message})

    def _require_origin(self) -> bool:
        if self._origin_allowed():
            return True
        self._error(HTTPStatus.FORBIDDEN, "Origin 不在本机允许列表")
        return False

    def _read_json(self) -> dict | None:
        raw_length = self.headers.get("Content-Length")
        try:
            length = int(raw_length or "0")
        except ValueError:
            self._error(HTTPStatus.BAD_REQUEST, "Content-Length 无效")
            return None
        if length <= 0:
            self._error(HTTPStatus.BAD_REQUEST, "请求体不能为空")
            return None
        if length > self.bridge_config["maxRequestBytes"]:
            self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "请求体过大")
            return None
        if self.headers.get_content_type() != "application/json":
            self._error(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, "仅接受 application/json")
            return None
        try:
            value = json.loads(self.rfile.read(length))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error(HTTPStatus.BAD_REQUEST, "JSON 请求体无效")
            return None
        if not isinstance(value, dict):
            self._error(HTTPStatus.BAD_REQUEST, "JSON 请求体必须是对象")
            return None
        return value

    def do_OPTIONS(self) -> None:
        if not self._require_origin():
            return
        path = urlsplit(self.path).path
        if path not in {"/v1/inventory", "/v1/plans"} and not PLAN_EXECUTE.match(path):
            self._error(HTTPStatus.NOT_FOUND, "接口不存在")
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        if not self._require_origin():
            return
        path = unquote(urlsplit(self.path).path)
        try:
            if path == "/v1/health":
                self._send(HTTPStatus.OK, self.bridge_service.health())
                return
            match = PLAN_GET.match(path)
            if match:
                self._send(HTTPStatus.OK, self.bridge_service.get_plan(match.group(1)))
                return
            self._error(HTTPStatus.NOT_FOUND, "接口不存在")
        except PlanNotFoundError as exc:
            self._error(HTTPStatus.NOT_FOUND, str(exc))
        except Exception as exc:
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc) or "内部错误")

    def do_POST(self) -> None:
        if not self._require_origin():
            return
        path = unquote(urlsplit(self.path).path)
        body = self._read_json()
        if body is None:
            return
        try:
            if path == "/v1/inventory":
                self._send(HTTPStatus.OK, self.bridge_service.inventory(body.get("spuId")))
                return
            if path == "/v1/plans":
                self._send(HTTPStatus.CREATED, self.bridge_service.create_plan(body))
                return
            match = PLAN_EXECUTE.match(path)
            if match:
                self._send(HTTPStatus.OK, self.bridge_service.execute(match.group(1), body.get("confirmationPhrase")))
                return
            self._error(HTTPStatus.NOT_FOUND, "接口不存在")
        except (ValueError, PlanValidationError, ConfirmationError) as exc:
            self._error(HTTPStatus.BAD_REQUEST, str(exc))
        except PlanNotFoundError as exc:
            self._error(HTTPStatus.NOT_FOUND, str(exc))
        except BridgeBusyError as exc:
            self._error(HTTPStatus.CONFLICT, str(exc))
        except (BridgeConflictError, PlanConflictError) as exc:
            self._error(HTTPStatus.CONFLICT, str(exc))
        except Exception as exc:
            self._error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc) or "内部错误")


def create_http_server(service: BridgeService, raw_config: dict, port: int | None = None) -> ThreadingHTTPServer:
    config = normalize_bridge_config(raw_config)
    if config["bindHost"] != "127.0.0.1":
        raise ValueError("Bridge 只能绑定 127.0.0.1")
    handler = type(
        "ConfiguredBridgeRequestHandler",
        (BridgeRequestHandler,),
        {"bridge_service": service, "bridge_config": config},
    )
    return ThreadingHTTPServer(("127.0.0.1", config["port"] if port is None else port), handler)
