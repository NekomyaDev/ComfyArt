from __future__ import annotations

import io

import pypdfium2
from aiohttp import FormData


def _pdf(pages: int) -> bytes:
    doc = pypdfium2.PdfDocument.new()
    for _ in range(pages):
        doc.new_page(200, 100)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


async def test_pages_are_rendered_into_input(bot_client, fresh_user_dir):
    form = FormData()
    form.add_field("file", _pdf(2), filename="BrandGuide.pdf", content_type="application/pdf")
    data = await (await bot_client.post("/comfyart/pdf", data=form)).json()
    assert data["total"] == 2
    page = data["pages"][0]
    assert page["type"] == "input" and page["subfolder"].startswith("comfyart/pdf/BrandGuide-")
    assert page["width"] == 2048
    assert (fresh_user_dir / "input" / page["subfolder"] / page["name"]).is_file()


async def test_not_a_pdf_is_a_bad_request(bot_client):
    form = FormData()
    form.add_field("file", b"hello", filename="x.pdf")
    assert (await bot_client.post("/comfyart/pdf", data=form)).status == 400
