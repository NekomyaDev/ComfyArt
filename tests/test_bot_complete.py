from __future__ import annotations

from conftest import write_settings

from ComfyArt.bot.providers import BotEvent, ProviderCaps


async def test_complete_uses_the_saved_default_agent(bot_client, fake_provider):
    write_settings(**{"bot-provider": "fake-test"})
    fake_provider.script = [BotEvent(t="delta", text="OK")]
    data = await (await bot_client.post("/comfyart/bot/complete", json={"text": "hi", "system": "SYS"})).json()
    assert data == {"text": "OK", "provider": "fake-test"}
    assert fake_provider.last_turn.user_text == "SYS\n\nhi"
    assert fake_provider.last_turn.mcp_endpoint == ""


async def test_complete_refuses_images_for_a_text_only_agent(bot_client, fake_provider, monkeypatch):
    write_settings(**{"bot-provider": "fake-test"})
    monkeypatch.setattr(type(fake_provider), "capabilities", lambda self: ProviderCaps(attachments=False))
    resp = await bot_client.post("/comfyart/bot/complete", json={"text": "read", "images": ["/api/view?filename=a.png"]})
    assert resp.status == 400
    assert "cannot read images" in (await resp.json())["error"]


async def test_complete_reports_agent_errors(bot_client, fake_provider):
    write_settings(**{"bot-provider": "fake-test"})
    fake_provider.result.error = "boom"
    resp = await bot_client.post("/comfyart/bot/complete", json={"text": "hi"})
    assert resp.status == 502
    assert (await resp.json())["error"] == "Fake: boom"
    fake_provider.result.error = ""
