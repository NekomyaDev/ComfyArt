from __future__ import annotations

import asyncio

from conftest import SENT, write_settings

from ComfyArt.api import chat_store, mcp_commands
from ComfyArt.api.bot_turns import ACTIVE_TURNS, _TurnState
from ComfyArt.bot._cli_common import CORE_MCP_TOOLS
from ComfyArt.bot.providers import TurnHandle


def _rpc(method, params=None, rid=1):
    return {"jsonrpc": "2.0", "id": rid, "method": method, "params": params or {}}


async def _answer_commands(client, reply):
    for _ in range(200):
        commands = [d for e, d in SENT if e == "comfyart-mcp-command"]
        if commands:
            SENT.clear()
            for c in commands:
                await client.post("/comfyart/mcp_command_result", json={"command_id": c["id"], **reply(c)})
            return commands
        await asyncio.sleep(0.01)
    raise AssertionError("no command was sent")


async def test_mcp_is_off_by_default(bot_client):
    write_settings(**{"enable-mcp": False})
    resp = await bot_client.post("/comfyart/mcp", json=_rpc("tools/list"))
    assert resp.status == 403


async def test_tools_list_matches_the_core_list(bot_client):
    tools = (await (await bot_client.post("/comfyart/mcp", json=_rpc("tools/list"))).json())["result"]["tools"]
    names = {t["name"] for t in tools}
    assert names == set(CORE_MCP_TOOLS) - {"ask_user"}
    chat = chat_store.create_chat(user="default", project="p", provider="codex")
    with_chat = await (await bot_client.post(f"/comfyart/mcp?bot_chat={chat['id']}", json=_rpc("tools/list"))).json()
    assert "ask_user" in {t["name"] for t in with_chat["result"]["tools"]}


async def test_canvas_tool_is_relayed_to_the_project_page(bot_client):
    chat = chat_store.create_chat(user="default", project="proj-7", provider="codex")
    call = asyncio.create_task(bot_client.post(f"/comfyart/mcp?bot_chat={chat['id']}",
                                               json=_rpc("tools/call", {"name": "get_canvas", "arguments": {}})))
    commands = await _answer_commands(bot_client, lambda c: {"ok": True, "result": {"shapes": [], "page": "page:1"}})
    data = await (await call).json()
    assert commands[0]["action"] == "get_canvas" and commands[0]["project"] == "proj-7"
    assert data["result"]["isError"] is False
    assert '"page": "page:1"' in data["result"]["content"][0]["text"]


async def test_view_canvas_png_becomes_an_image_block(bot_client):
    call = asyncio.create_task(bot_client.post("/comfyart/mcp", json=_rpc("tools/call", {"name": "view_canvas", "arguments": {}})))
    await _answer_commands(bot_client, lambda c: {"ok": True, "result": {"width": 4, "png": "QUJD"}})
    content = (await (await call).json())["result"]["content"]
    assert content[1] == {"type": "image", "data": "QUJD", "mimeType": "image/png"}
    assert "png" not in content[0]["text"]


async def test_list_models_keeps_its_image_field(bot_client):
    call = asyncio.create_task(bot_client.post("/comfyart/mcp", json=_rpc("tools/call", {"name": "list_models", "arguments": {}})))
    await _answer_commands(bot_client, lambda c: {"ok": True, "result": {"image": [{"id": "m"}], "video": []}})
    content = (await (await call).json())["result"]["content"]
    assert len(content) == 1 and '"image": [{"id": "m"}]' in content[0]["text"]


async def test_page_errors_come_back_as_tool_errors(bot_client):
    call = asyncio.create_task(bot_client.post("/comfyart/mcp", json=_rpc("tools/call", {"name": "focus", "arguments": {"ids": ["x"]}})))
    await _answer_commands(bot_client, lambda c: {"ok": False, "error": "no shape x"})
    result = (await (await call).json())["result"]
    assert result["isError"] is True and "no shape x" in result["content"][0]["text"]


async def test_no_page_times_out_with_a_clear_error(monkeypatch):
    try:
        await mcp_commands.submit_command("get_canvas", {}, "p", timeout=0.05)
    except ValueError as e:
        assert "must stay open" in str(e)
    else:
        raise AssertionError("expected a timeout")


async def test_generation_asks_first_when_the_chat_runs_in_ask_mode(bot_client):
    chat = chat_store.create_chat(user="default", project="p", provider="codex", run_mode="ask")
    msg = chat_store.create_message(chat_id=chat["id"], role="assistant", blocks=[], status="streaming")
    ACTIVE_TURNS[chat["id"]] = _TurnState(TurnHandle(), chat["id"], msg["id"])
    call = asyncio.create_task(bot_client.post(f"/comfyart/mcp?bot_chat={chat['id']}", json=_rpc(
        "tools/call", {"name": "generate_image", "arguments": {"prompt": "a cat"}})))
    for _ in range(200):
        asks = [d for e, d in SENT if e == "comfyart-bot" and d["event"] == "turn_ask"]
        if asks:
            break
        await asyncio.sleep(0.01)
    assert asks[0]["kind"] == "run_approval" and "a cat" in asks[0]["prompt"]
    await bot_client.post(f"/comfyart/bot/chats/{chat['id']}/asks/{asks[0]['ask_id']}/answer", json={"selected": ["cancel"]})
    result = (await (await call).json())["result"]
    assert '"declined"' in result["content"][0]["text"]
    assert not [d for e, d in SENT if e == "comfyart-mcp-command"]
    ACTIVE_TURNS.clear()
