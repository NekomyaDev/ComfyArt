import json
import os

import folder_paths
from aiohttp import web
from server import PromptServer

routes = PromptServer.instance.routes


def app_path(*parts: str) -> str:
    return os.path.join(folder_paths.get_system_user_directory("comfyart"), *parts)


def request_user(request: web.Request) -> str:
    try:
        return PromptServer.instance.user_manager.get_request_user_id(request)
    except KeyError as e:
        raise web.HTTPForbidden(text=str(e))


def error(message: str, status: int) -> web.Response:
    return web.json_response({"error": message}, status=status)


async def json_body(request: web.Request) -> dict:
    try:
        body = await request.json()
    except ValueError:
        raise web.HTTPBadRequest(text=json.dumps({"error": "invalid JSON body"}), content_type="application/json")
    if not isinstance(body, dict):
        raise web.HTTPBadRequest(text=json.dumps({"error": "body must be an object"}), content_type="application/json")
    return body


def read_json(path: str, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    os.replace(tmp, path)
