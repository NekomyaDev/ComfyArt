from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont


def _text_image(base, name):
    path = base / "output" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    im = Image.new("RGB", (800, 240), "white")
    ImageDraw.Draw(im).text((40, 70), "SUMMER SALE", fill="black", font=ImageFont.load_default(96))
    im.save(path)
    return f"/api/view?filename={name}&subfolder=&type=output"


async def test_ocr_returns_lines_with_boxes(bot_client, fresh_user_dir):
    res = await bot_client.post("/comfyart/ocr", json={"src": _text_image(fresh_user_dir, "sale.png")})
    assert res.status == 200
    lines = (await res.json())["lines"]
    assert any("SUMMER" in line["text"] for line in lines)
    assert all(len(line["box"]) == 4 for line in lines)


async def test_ocr_rejects_missing_and_invalid_sources(bot_client, fresh_user_dir):
    assert (await bot_client.post("/comfyart/ocr", json={})).status == 400
    assert (await bot_client.post("/comfyart/ocr", json={"src": "/api/view?filename=nope.png&type=output"})).status == 404
    assert (await bot_client.post("/comfyart/ocr", json={"src": "/api/view?filename=../../x.png&type=output"})).status == 404
