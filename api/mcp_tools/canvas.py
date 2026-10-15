from ..mcp_commands import submit_command
from ._context import PROJECT
from .bot_tools import maybe_ask_run_approval

WAIT_MAX_S = 170

_ID = {"type": "string", "description": "shape id exactly as get_canvas returns it, e.g. shape:abc"}
_IDS = {"type": "array", "items": {"type": "string"}}
_POINT = {"type": "number"}
_PLACE = {
    "frame": {"type": "string", "description": "frame id to place the result inside"},
    "near": {"type": "string", "description": "shape id to place the result next to"},
}


def _schema(properties: dict, required: list[str] = ()) -> dict:
    return {"type": "object", "properties": properties, "required": list(required), "additionalProperties": False}


def _relay(action: str, *, timeout: float = 20.0, approval: str = ""):
    async def handler(args: dict) -> dict:
        if approval:
            label = str(args.get("prompt") or args.get("to") or "")[:80]
            blocked = await maybe_ask_run_approval(f"{approval}{'：' + label if label else ''}")
            if blocked is not None:
                return blocked
        result = await submit_command(action, args, PROJECT.get(), timeout)
        image = result.pop("png", None)
        if image:
            result["_images"] = [{"data": image, "mime": "image/png"}]
        return result
    return handler


async def _wait_generation(args: dict) -> dict:
    timeout = max(1, min(int(args.get("timeout_s") or WAIT_MAX_S), WAIT_MAX_S))
    return await submit_command("wait_generation", {**args, "timeout_s": timeout}, PROJECT.get(), timeout + 15)


def _tool(description: str, properties: dict, required: list[str] = (), **relay) -> dict:
    return {"description": description, "inputSchema": _schema(properties, required), "relay": relay}


SPECS: dict[str, dict] = {
    "get_canvas": _tool(
        "List the open project: pages, the current page's frames and shapes (id, type, name or text, "
        "x/y/width/height, parent, image or video URL, generation prompt), the selection, the linked "
        "brand kit and running generations. page selects another page by id or name.",
        {"page": {"type": "string"}}),
    "view_canvas": _tool(
        "Render real pixels of the current page (default), of some shapes or frames (ids), so you can "
        "see layout and results. max_px caps the long side (default 1024).",
        {"ids": _IDS, "max_px": {"type": "integer"}}),
    "list_models": _tool(
        "Installed image and video models with ids, what they are good at, whether they accept "
        "reference images, and supported ratios.", {}),
    "brand_kits": _tool(
        "The user's brand kits and saved assets (characters, products): names, descriptions, colors "
        "with roles, fonts, logo and reference image URLs, and which kit this project is linked to.", {}),
    "generate_image": _tool(
        "Start generating images on the canvas. Returns ids at once; call wait_generation with them. "
        "prompt: detailed English description (put exact text to render in quotes). ratio like 1:1, "
        "3:4, 16:9. count 1-4. refs: image shape ids or image URLs the result must follow (subject, "
        "product, style). base: an image shape id to transform (image-to-image) with base_strength "
        "0-100 (higher changes more).",
        {"prompt": {"type": "string"}, "model": {"type": "string"}, "ratio": {"type": "string"},
         "count": {"type": "integer"}, "refs": _IDS, "base": {"type": "string"},
         "base_strength": {"type": "integer"}, **_PLACE},
        ["prompt"], approval="生成图像"),
    "generate_video": _tool(
        "Start generating a video. Returns ids at once; call wait_generation with them. first_frame / "
        "last_frame are image shape ids. duration in seconds (5 or 10).",
        {"prompt": {"type": "string"}, "model": {"type": "string"}, "ratio": {"type": "string"},
         "duration": {"type": "integer"}, "first_frame": {"type": "string"}, "last_frame": {"type": "string"},
         **_PLACE},
        ["prompt"], approval="生成视频"),
    "edit_image": _tool(
        "Edit an image shape with an instruction (change, add or remove things, restyle). The result is "
        "placed next to it. Returns ids for wait_generation.",
        {"id": _ID, "prompt": {"type": "string"}}, ["id", "prompt"], approval="编辑图片"),
    "animate_image": _tool(
        "Turn an image shape into a short video (motion described by prompt). loop makes the last frame "
        "match the first. Returns ids for wait_generation.",
        {"id": _ID, "prompt": {"type": "string"}, "loop": {"type": "boolean"}}, ["id", "prompt"],
        approval="动态图片"),
    "upscale_image": _tool(
        "Upscale an image shape by factor 2 or 4. creative=true re-renders details (style optional).",
        {"id": _ID, "factor": {"type": "integer", "enum": [2, 4]}, "creative": {"type": "boolean"},
         "style": {"type": "string"}}, ["id"], approval="放大"),
    "remove_background": _tool(
        "Cut the main subject out of an image shape onto a transparent background.",
        {"id": _ID}, ["id"], approval="去背景"),
    "expand_image": _tool(
        "Outpaint an image shape: extend it by left/top/right/bottom pixels, filling the new area "
        "(prompt optional).",
        {"id": _ID, "left": _POINT, "top": _POINT, "right": _POINT, "bottom": _POINT, "prompt": {"type": "string"}},
        ["id"], approval="扩图"),
    "split_layers": _tool(
        "Split an image shape into separate transparent layers (layers 2-8).",
        {"id": _ID, "layers": {"type": "integer"}, "prompt": {"type": "string"}}, ["id"], approval="图层拆分"),
    "change_angle": _tool(
        "Re-render an image shape from another camera angle: horizontal -180..180 degrees, vertical "
        "-90..90 degrees, zoom 0.5..2.",
        {"id": _ID, "horizontal": _POINT, "vertical": _POINT, "zoom": _POINT}, ["id"], approval="多角度"),
    "replace_text": _tool(
        "Replace text rendered inside an image shape: from is the current text, to the new text.",
        {"id": _ID, "from": {"type": "string"}, "to": {"type": "string"}}, ["id", "from", "to"],
        approval="编辑文字"),
    "extend_video": _tool(
        "Continue a video shape by duration seconds following prompt.",
        {"id": _ID, "prompt": {"type": "string"}, "duration": {"type": "integer"}}, ["id", "prompt"],
        approval="视频延长"),
    "place_html": _tool(
        "Place a web page on the canvas: html is one complete self-contained HTML document you wrote "
        "(inline CSS/JS, images by absolute URL). width/height in canvas units.",
        {"html": {"type": "string"}, "name": {"type": "string"}, "x": _POINT, "y": _POINT,
         "width": _POINT, "height": _POINT},
        ["html"]),
    "create_slides": _tool(
        "Build a slide deck as 1280x720 frames with editable title and bullet text; slides with image "
        "get a generated picture (image is an English image prompt). Returns frame ids and generation ids.",
        {"title": {"type": "string"},
         "slides": {"type": "array", "items": _schema({"title": {"type": "string"},
                                                       "bullets": {"type": "array", "items": {"type": "string"}},
                                                       "image": {"type": "string"}}, ["title"])}},
        ["slides"], approval="制作 PPT"),
    "add_text": _tool(
        "Add an editable text shape. font_size in px, color as hex, font family name (brand fonts work), "
        "width wraps the text. x/y are page coordinates, or relative to frame when frame is given.",
        {"text": {"type": "string"}, "x": _POINT, "y": _POINT, "width": _POINT, "font_size": _POINT,
         "color": {"type": "string"}, "font": {"type": "string"},
         "align": {"type": "string", "enum": ["left", "center", "right"]}, "frame": _PLACE["frame"]},
        ["text"]),
    "add_shape": _tool(
        "Add a vector shape: kind rect, ellipse, polygon (sides) or star (sides = points). fill and "
        "stroke as hex.",
        {"kind": {"type": "string", "enum": ["rect", "ellipse", "polygon", "star"]}, "x": _POINT, "y": _POINT,
         "width": _POINT, "height": _POINT, "sides": {"type": "integer"}, "fill": {"type": "string"},
         "stroke": {"type": "string"}, "frame": _PLACE["frame"]},
        ["kind"]),
    "create_frame": _tool(
        "Create an artboard frame (name, width, height). children: shape ids to move inside it.",
        {"name": {"type": "string"}, "width": _POINT, "height": _POINT, "x": _POINT, "y": _POINT,
         "children": _IDS},
        ["width", "height"]),
    "update_shapes": _tool(
        "Change shapes: each update has id plus any of x, y (page coordinates), width, height, rotation "
        "(degrees), name (frames), text (text shapes), color (hex; text color or shape fill), opacity "
        "(0-1), frame (move into a frame id, or '' for the page).",
        {"updates": {"type": "array", "items": _schema({
            "id": _ID, "x": _POINT, "y": _POINT, "width": _POINT, "height": _POINT, "rotation": _POINT,
            "name": {"type": "string"}, "text": {"type": "string"}, "color": {"type": "string"},
            "opacity": _POINT, "frame": {"type": "string"}}, ["id"])}},
        ["updates"]),
    "delete_shapes": _tool("Delete shapes by id.", {"ids": _IDS}, ["ids"]),
    "focus": _tool(
        "Show shapes to the user: switch page if needed, select them and zoom to them.",
        {"ids": _IDS}, ["ids"]),
    "memory": _tool(
        "The user's long-term memory across projects. action list; add with text and category (about, "
        "taste, work, assets); correct with old (copied exactly) and new; forget with text (copied "
        "exactly). Save only lasting preferences the user states, not one-off requests.",
        {"action": {"type": "string", "enum": ["list", "add", "correct", "forget"]},
         "text": {"type": "string"}, "category": {"type": "string"},
         "old": {"type": "string"}, "new": {"type": "string"}},
        ["action"]),
    "skill": _tool(
        "Installed skills (instruction packs). action list; read with name (and optional path for a "
        "bundled file); save with name and instructions to store a reusable workflow the user wants "
        "to keep. When a task matches a skill, read it first and follow it.",
        {"action": {"type": "string", "enum": ["list", "read", "save"]}, "name": {"type": "string"},
         "path": {"type": "string"}, "instructions": {"type": "string"}},
        ["action"]),
}

TOOLS: dict[str, dict] = {
    name: {"description": spec["description"], "inputSchema": spec["inputSchema"],
           "handler": _relay(name, **spec["relay"])}
    for name, spec in SPECS.items()
}
TOOLS["wait_generation"] = {
    "description": (
        "Wait for generations started by generate_image, generate_video and the edit tools. ids are the "
        "ids those tools returned. Returns status done with the placed shape ids and URLs of each "
        "result (or its error), or status running when timeout_s (max 170) passed first — then call "
        "it again."),
    "inputSchema": _schema({"ids": _IDS, "timeout_s": {"type": "integer"}}, ["ids"]),
    "handler": _wait_generation,
}
