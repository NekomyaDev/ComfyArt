# Feature checklist

`[x]` done, `[ ]` to do, `—` out of scope (online service, account, billing or community).

## Canvas and editing

- [x] Pages, background color, minimap, zoom menu, shortcuts dialog
- [x] Layers panel with history, hide and lock; generated files; assets library (`/api/assets`)
- [x] Right-click menu (clipboard, order, group, flip, lock, replace, send to generator, batch rename, export)
- [x] Multi-select toolbar: auto arrange, group, merge, align, distribute, download, PSD export
- [x] Text (any font, weight, size, color, stroke, align, spacing) and shapes (rect, ellipse, polygon, star)
- [x] Doodle with any color and px width; comments with point, lasso, box and touch edit
- [x] Media preview lightbox (prev/next, rotate, zoom, download)
- [x] Image adjust (exposure, contrast, saturation, temperature, tint, highlights, shadows)
- [x] Layer effects: opacity, shadow, blur; rotate 90°
- [x] Export options: PNG, JPG, PDF, scale
- [x] Shape stroke (inner, center, outer; solid, dashed, dotted) and gradient fill (linear, radial)
- [x] Text decoration and case
- [x] Line and arrow tools
- [x] Frame (smart artboard) toolbar: auto layout, fit content, W/H, generate into frame, batch download, export
- [x] Comments panel: all comments, done / open filter, add to chat, run all
- [x] Canvas history: snapshots and restore
- [x] Empty viewport "back to content", page delete confirm
- [x] Vectorize image to SVG
- [x] Rasterize shapes to image

## Image tools

- [x] Quick edit, upscale, remove background, eraser, layer split, edit text, angles, animate, expand, crop, flip
- [x] Inpaint with selection (brush, eraser, lasso, rect, SAM3 smart select, invert, feather) and prompt
- [x] Restore original
- [x] Style transfer (presets or reference image), remix (same prompt), regenerate
- [x] Generation info, copy prompt, copy image
- [x] Extract text (OCR through the local VLM)
- [x] Move object (select with brush, lasso, box or SAM3, drag, LaMa fills the old spot)
- [x] Layer split with region picking (up to 6 boxes, SAM3 per box, LaMa background)

## Generators

- [x] Image and video generators, ratios, count, duration, references, first frame
- [x] Transparent background, custom W/H, quality
- [x] Camera motion presets for video, storyboard (multi-scene video)
- [x] Style presets

## Video

- [x] Trim, extend
- [x] Video editor: split, trim, transitions, subtitles, volume, speed, export as new / replace

## Agent

- [x] Chat sessions, history, maximize, modes, skills (built-in, custom, from chat), references, `/` and `@`
- [x] Memory (preferences remembered across projects)
- [x] Brand kit / character / product assets usable with `@`
- [x] Reference board (style, composition analysis, variants, moodboard)
- [x] Agent questions (clarifying multiple choice)
- [x] Task-done browser notification

## Second pass

- [x] Inpaint styles (realistic, portrait photo, anime, illustration, 3D, game CG, keep original)
- [x] Chat panel dock left / right
- [x] Customizable image toolbar and show / hide tool names
- [x] Upscale styles and detail strength (creative upscale)
- [x] Animate as animated image (keeps ratio)
- [x] Generator reference modes (content, style, line art, composition) and color reference
- [x] Comment object recognition (click marks the object under the pin)
- [x] Smudge tool
- [x] Skills as file folders: SKILL.md plus extra files, import folder, version history and rollback
- [x] Model preferences dialog: auto or per-model choice for the Agent, Image / Video tabs, installed-model detection (Qwen Image 2.1, Z-Image Turbo, Flux.2 Klein 9B, MiniMax H3)

## Third pass

- [x] Image adjust tabs (light, color, detail, effects): auto, compare, clarity, sharpen, grain, vignette, bloom, glamour, vibrance, blacks, whites
- [x] Expand presets (original ratio, square, landscape, portrait, post, story, cover photo, profile photo, thumbnail) and scale
- [x] Multi-angle presets (close-up, medium, wide, rotate, tilt, scale)
- [x] Text size presets, sticky note, dock insert menu (text, shapes, line, arrow, note, artboard)
- [x] Frame: lock aspect ratio, ZIP download, fullscreen slideshow, image fill / fit
- [x] Export PPTX (image slides or editable text) (one slide per frame or page)
- [x] Add canvas selection to my assets (brand kit, character, product, custom)
- [x] Brand kit: named color roles, logos, fonts, guidelines, extract from a brand file, duplicate, default for new projects
- [x] Memory: categories (about me, taste, way of working, assets), onboarding questions, extract from uploaded files
- [x] Agent: stop, summarize comments into a fix plan, canvas review, locate results on canvas, re-edit and regenerate a message, context usage
- [x] Generator: base image with strength (image to image), video last frame, smart storyboard
- [x] Video upscale (1080p, 2K, 4K; keeps audio and fps)
- [x] Touch edit: Ctrl + click on an image, Shift + click adds mark points, "no object found"
- [x] Preview mute toggle, stale tab warning (other tab saved the same project; this tab stops saving)

## Fourth pass (shortcuts taken earlier, now done properly)

- [x] PDF: brand guide and memory import accept PDF; PDF pages can be placed on the canvas (dropped PDFs become a frame of pages)
- [x] Canvas uploads: Lottie player (.json, .lottie), 3D model viewer (GLB, GLTF, OBJ, FBX, STL, PLY; orbit, spin, background, export view), HTML widget (interactive, preview, download); "上传文件" in the insert menu
- [x] Agent web page design (HTML on canvas) and PPT generation (slides as frames with editable text and generated images, PPTX export)
- [x] Reference modes: MLSD, Lineart, Scribble, depth, normal, pose, segmentation, soft edge, tile, recolor, color, shuffle, brightness (comfyui_controlnet_aux preprocessors); real ControlNet union with strength on Qwen Image 2512
- [x] Animate: seamless loop (first frame reused as last frame, on by default)
- [x] Qwen Image 2512 and Ideogram 4: find the real cause and bring them back (2512: fp8_matrix_mult, fixed with the ComfyArt loader; Ideogram: needs a structured caption, written by the local LLM)
- [x] Customizable toolbar covers every image tool (including quick edit, upscale, layer split, flip, rotate, info, export)
- [x] Agent sees every reference image (not only the first); regenerate keeps the original references
- [x] Canvas review per frame or tile instead of one downscaled screenshot
- [x] Editable PPTX keeps images, text, notes and shapes as separate editable objects (other shapes as their own images)
- [x] Skills: image files kept and shown to the Agent; text files included whole by relevance within a context budget, the rest listed by name; skipped files reported
- [x] Memory: name question, change or forget memories through chat, evolution log, self-evolving skills (agent suggests saving a workflow as a skill)
- [x] Brand kit: upload font files (registered for canvas text) and pick local fonts, "design with this kit" (new project linked to the kit), set cover
- [x] Frame: fixed or hug width and height, auto layout that re-flows on change or manual, slideshow from the page context menu; ratio unlock fixed
- [x] Reference panel: filter by source, sort by time or name, open, rename, copy, cut, duplicate, export, delete
- [x] Touch edit with hover + C (C elsewhere still picks the comment tool)
- [x] Agent result details (process, outputs, original prompt)
- [x] Agent notification center (suggestions, comment fixes, finished tasks)
- [x] Voice input with a local speech recognition model (Gemma 4 E4B through TextGenerate audio input)
- [x] Scheduled tasks: run an Agent prompt on a schedule (daily, weekly) while ComfyArt is open

## Out of scope

- — Font generator (needs a font training model)
- — Publish, share, community, remix of others' canvases
- — Credits, plans, team, login, onboarding
- — Connectors (Pinterest, Google Drive, Shopify), web search, deep research
