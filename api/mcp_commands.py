import asyncio
import uuid

from aiohttp import web
from server import PromptServer

from ._common import json_body, routes

COMMAND_EVENT = "comfyart-mcp-command"
DEFAULT_TIMEOUT_S = 20.0

_pending: dict[str, asyncio.Future] = {}


async def submit_command(action: str, payload: dict, project: str,
                         timeout: float = DEFAULT_TIMEOUT_S, chat: str = "") -> dict:
    command_id = uuid.uuid4().hex
    future: asyncio.Future = asyncio.get_running_loop().create_future()
    _pending[command_id] = future
    try:
        PromptServer.instance.send_sync(COMMAND_EVENT, {"id": command_id, "action": action, "project": project, "chat": chat, "args": payload})
        return await asyncio.wait_for(future, timeout)
    except asyncio.TimeoutError:
        raise ValueError(
            f"no ComfyArt page answered the {action!r} command within {timeout:.0f}s — "
            f"the project {project or '(any)'} must stay open in a browser tab")
    finally:
        _pending.pop(command_id, None)


@routes.post("/comfyart/mcp_command_result")
async def post_command_result(request: web.Request) -> web.Response:
    body = await json_body(request)
    future = _pending.get(str(body.get("command_id") or ""))
    if future is None or future.done():
        return web.json_response({"ok": False, "reason": "unknown or expired command"})
    if body.get("ok"):
        result = body.get("result")
        future.set_result(result if isinstance(result, dict) else {"result": result})
    else:
        future.set_exception(ValueError(str(body.get("error") or "command failed in the ComfyArt page")))
    return web.json_response({"ok": True})
