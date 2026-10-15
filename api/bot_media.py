import base64
import io
import os
from urllib.parse import parse_qs, urlparse

import av
import folder_paths
from PIL import Image

_ATTACH_MAX_PX = 1024
_ATTACH_JPEG_QUALITY = 85
ATTACH_MAX_COUNT = 12
VIDEO_EXT = (".mp4", ".webm", ".mov", ".mkv")
MEDIA_ERRORS = (ValueError, OSError, av.FFmpegError)


def view_path(url: str) -> str:
    query = parse_qs(urlparse(url).query)
    name = (query.get("filename") or [""])[0]
    subfolder = (query.get("subfolder") or [""])[0]
    root = folder_paths.get_directory_by_type((query.get("type") or ["output"])[0])
    if not name or root is None:
        raise ValueError(f"not a ComfyUI file URL: {url}")
    root = os.path.abspath(root)
    path = os.path.abspath(os.path.join(root, subfolder, name))
    if os.path.commonpath([root, path]) != root or not os.path.isfile(path):
        raise ValueError(f"file not found: {url}")
    return path


def video_frame(path: str) -> Image.Image:
    with av.open(path) as container:
        stream = container.streams.video[0]
        if stream.duration and stream.time_base:
            container.seek(int(stream.duration / 2), stream=stream)
        for frame in container.decode(stream):
            return frame.to_image()
    raise ValueError("video has no frames")


def render_attachment(url: str) -> dict:
    path = view_path(url)
    im = video_frame(path) if path.lower().endswith(VIDEO_EXT) else Image.open(path)
    with im:
        im = im.convert("RGB")
        im.thumbnail((_ATTACH_MAX_PX, _ATTACH_MAX_PX))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=_ATTACH_JPEG_QUALITY)
    return {"data": base64.b64encode(buf.getvalue()).decode("ascii"), "media_type": "image/jpeg"}
