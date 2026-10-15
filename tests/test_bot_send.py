from __future__ import annotations

import pytest
from PIL import Image

from ComfyArt.api import bot_send
from ComfyArt.api.bot_media import view_path


def _image(base, name="a.png"):
    folder = base / "output" / "comfyart"
    folder.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (2048, 1024), (200, 10, 10)).save(folder / name)
    return f"/api/view?filename={name}&subfolder=comfyart&type=output"


def test_parse_refs_and_kits_validate_shapes():
    assert bot_send.parse_refs([{"src": "/v", "id": "shape:a"}])[0]["kind"] == "image"
    with pytest.raises(ValueError):
        bot_send.parse_refs([{"id": "shape:a"}])
    with pytest.raises(ValueError):
        bot_send.parse_kits([{"name": "k", "images": [1]}])


def test_view_path_stays_inside_the_folder(fresh_user_dir):
    _image(fresh_user_dir)
    with pytest.raises(ValueError):
        view_path("/api/view?filename=../../secret.txt&type=output")
    with pytest.raises(ValueError):
        view_path("/api/view?filename=a.png&type=models")


async def test_attachments_are_downscaled_and_bad_kit_images_skipped(fresh_user_dir):
    src = _image(fresh_user_dir)
    refs = bot_send.parse_refs([{"src": src, "id": "shape:a", "name": "poster"}])
    kits = bot_send.parse_kits([{"name": "Brand", "description": "Brand kit", "images": [src, "/api/view?filename=missing.png&type=output"]}])
    attachments, lines = await bot_send.prepare_attachments(refs, kits)
    assert len(attachments) == 2 and attachments[0]["media_type"] == "image/jpeg"
    assert "shape id shape:a" in lines[0]
    assert "could not be attached" in lines[-1]


async def test_a_missing_canvas_ref_is_an_error(fresh_user_dir):
    with pytest.raises(ValueError):
        await bot_send.prepare_attachments(bot_send.parse_refs([{"src": "/api/view?filename=nope.png&type=output"}]), [])


def test_compose_puts_memory_first_and_skill_instruction_before_the_text():
    text = bot_send.compose_provider_text("make it", skill_name="Poster", memory="MEM", lines=["[ref]"])
    assert text.startswith("MEM\n\nUse the ComfyArt skill 'Poster'")
    assert text.endswith("make it\n\n[ref]")
