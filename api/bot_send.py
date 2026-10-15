import asyncio
from typing import Optional

from . import chat_store
from .bot_media import ATTACH_MAX_COUNT, MEDIA_ERRORS, render_attachment
from .bot_turns import ACTIVE_TURNS, QUEUED, begin_turn, broadcast


def _strings(raw, name: str) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):
        raise ValueError(f"{name} must be an array of strings")
    return raw


def parse_refs(raw) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("refs must be an array")
    refs = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict) or not isinstance(item.get("src"), str):
            raise ValueError(f"refs[{i}] needs src")
        refs.append({"id": str(item.get("id") or ""), "src": item["src"], "name": str(item.get("name") or ""),
                     "kind": "video" if item.get("kind") == "video" else "image"})
    return refs


def parse_kits(raw) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("kits must be an array")
    kits = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict) or not isinstance(item.get("name"), str):
            raise ValueError(f"kits[{i}] needs name")
        kits.append({"name": item["name"], "description": str(item.get("description") or ""),
                     "images": _strings(item.get("images"), f"kits[{i}].images")})
    return kits


async def prepare_attachments(refs: list[dict], kits: list[dict]) -> tuple[list[dict], list[str]]:
    attachments = []
    for r in refs[:ATTACH_MAX_COUNT]:
        try:
            attachments.append(await asyncio.to_thread(render_attachment, r["src"]))
        except MEDIA_ERRORS as e:
            raise ValueError(f"could not read {r['src']} ({e})") from e
    skipped = []
    for src in [src for k in kits for src in k["images"]][:ATTACH_MAX_COUNT - len(attachments)]:
        try:
            attachments.append(await asyncio.to_thread(render_attachment, src))
        except MEDIA_ERRORS:
            skipped.append(src)
    lines = []
    for i, r in enumerate(refs):
        label = f' "{r["name"]}"' if r["name"] else ""
        target = f"shape id {r['id']}" if r["id"] else "not on the canvas"
        lines.append(f"[Attached {r['kind']} {i + 1}{label}: {target} — {r['src']}. Use the shape id with edit tools or as a generation ref.]")
    for k in kits:
        lines.append(f"[Referenced asset: {k['description'] or k['name']}. Its {len(k['images'])} image(s) are attached after the canvas images; pass their URLs as refs to follow them.]"
                     + "".join(f"\n  - {src}" for src in k["images"]))
    if len(refs) + sum(len(k["images"]) for k in kits) > ATTACH_MAX_COUNT:
        lines.append(f"[Only the first {ATTACH_MAX_COUNT} images are attached; look at the rest with view_canvas.]")
    if skipped:
        lines.append(f"[These asset images could not be attached: {', '.join(skipped)}]")
    return attachments, lines


def compose_provider_text(text: str, *, skill_name: str = "", memory: str = "",
                          lines: list[str] = ()) -> str:
    provider_text = text or "Look at the attached images and tell me what you see."
    if skill_name:
        provider_text = (
            f"Use the ComfyArt skill {skill_name!r} for this task: first call "
            f"the comfyart MCP tool skill with action='read' and "
            f"name={skill_name!r}, then follow those instructions.\n\n"
            + provider_text)
    if lines:
        provider_text += "\n\n" + "\n".join(lines)
    if memory:
        provider_text = memory + "\n\n" + provider_text
    return provider_text


def queue_or_begin(chat: dict, *, text: str, provider_text: str,
                   attachments: list[dict], display_blocks: list[dict]) -> tuple[dict, Optional[dict]]:
    if chat["id"] in ACTIVE_TURNS:
        user_msg = chat_store.create_message(chat_id=chat["id"], role="user", blocks=display_blocks, status="queued")
        QUEUED.setdefault(chat["id"], []).append({
            "user_msg": user_msg,
            "text": text,
            "provider_text": provider_text,
            "attachments": attachments,
        })
        broadcast("message_queued", {"chat_id": chat["id"], "user_message": user_msg})
        return user_msg, None
    user_msg = chat_store.create_message(chat_id=chat["id"], role="user", blocks=display_blocks)
    assistant_msg = begin_turn(chat, text=text, provider_text=provider_text,
                               attachments=attachments, user_msg=user_msg)
    return user_msg, assistant_msg
