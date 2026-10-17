import { createShapeId, type Editor, type TLFrameShape, type TLImageShape } from 'tldraw'

import { maskFile } from './actions'
import { loadImage } from './adjust'
import { api, queuePrompt, uploadImage, viewUrl, waitForImages } from './comfy'
import { placeMedia, registerPlacer, selectResults, spawnHolder, startJob, type ErrorSink } from './jobs'
import { cropLayer, grow, pixels, type RegionLayer } from './layers'
import { exportImage } from './shapes/ArtboardShape'
import { TEXT, type TextShape } from './shapes/TextShape'
import { annotated, editGraph, eraseGraph, samGraph } from './workflows'
import { t } from './i18n'

interface Line { box: [number, number][]; text: string; score: number }
interface TextLayer { text: string; cx: number; cy: number; w: number; h: number; angle: number; color: string; weight: number }

const MIN_SCORE = 0.6
const MASK_PAD = 0.2
const MAX_SIZE_PER_HEIGHT = 1.05
const TEXT_FILL = 0.94
const PROBE_SIZE = 100
const FONT = 'Arial'
const BOLD_INK = 0.3
const OBJECT_PROMPTS = ['product', 'logo']
const MIN_OBJECT = 0.002
const OBJECT_GROW = 6
const RERENDER_SCALE = 2
const RERENDER_LONG = 2048
const RERENDER_PROMPT = 'Fix only the seams between the elements of this design: blend edges, contact shadows and lighting so nothing looks pasted on. Every object stays complete with all of its parts, in the same place, size and shape. Keep the background, all text, logos, layout and colors exactly as they are. Do not add or remove anything.'

async function readLines(src: string): Promise<Line[]> {
  const res = await api('/comfyart/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src }) })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `OCR failed: ${res.status}`)
  return (body.lines as Line[]).filter((l) => l.score >= MIN_SCORE && l.text.trim())
}

const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0')

function inkOf(ctx: CanvasRenderingContext2D, box: [number, number][]) {
  const xs = box.map((p) => p[0])
  const ys = box.map((p) => p[1])
  const [x, y] = [Math.max(0, Math.floor(Math.min(...xs))), Math.max(0, Math.floor(Math.min(...ys)))]
  const [w, h] = [Math.min(ctx.canvas.width, Math.ceil(Math.max(...xs))) - x, Math.min(ctx.canvas.height, Math.ceil(Math.max(...ys))) - y]
  const d = ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h)).data
  let mean = 0
  for (let i = 0; i < d.length; i += 4) mean += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  mean /= d.length / 4
  const sums = [[0, 0, 0, 0], [0, 0, 0, 0]]
  for (let i = 0; i < d.length; i += 4) {
    const s = sums[0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] > mean ? 1 : 0]
    s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; s[3]++
  }
  const ink = sums[0][3] <= sums[1][3] ? sums[0] : sums[1]
  const n = Math.max(1, ink[3])
  return { color: `#${hex(ink[0] / n)}${hex(ink[1] / n)}${hex(ink[2] / n)}`, weight: ink[3] / (d.length / 4) > BOLD_INK ? 700 : 400 }
}

function layersOf(lines: Line[], img: HTMLImageElement): TextLayer[] {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  return lines.map(({ box, text }) => {
    const [p0, p1, p2, p3] = box
    return {
      text,
      cx: (p0[0] + p1[0] + p2[0] + p3[0]) / 4,
      cy: (p0[1] + p1[1] + p2[1] + p3[1]) / 4,
      w: Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
      h: Math.hypot(p2[0] - p1[0], p2[1] - p1[1]),
      angle: Math.atan2(p1[1] - p0[1], p1[0] - p0[0]),
      ...inkOf(ctx, box),
    }
  })
}

function paintBoxes(ctx: CanvasRenderingContext2D, layers: TextLayer[], padding: number) {
  for (const l of layers) {
    const pad = l.h * padding
    ctx.save()
    ctx.translate(l.cx, l.cy)
    ctx.rotate(l.angle)
    ctx.fillRect(-l.w / 2 - pad, -l.h / 2 - pad, l.w + pad * 2, l.h + pad * 2)
    ctx.restore()
  }
}

async function objectLayers(src: string, w: number, h: number, texts: TextLayer[]) {
  const orig = pixels(await loadImage(src), w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const tctx = c.getContext('2d', { willReadFrequently: true })!
  paintBoxes(tctx, texts, MASK_PAD)
  const textMask = tctx.getImageData(0, 0, w, h).data
  const union = new Uint8ClampedArray(w * h * 4)
  const layers: RegionLayer[] = []
  for (const prompt of OBJECT_PROMPTS) {
    const sam = samGraph(annotated(src), { text: prompt })
    const [ref] = await waitForImages(await queuePrompt(sam.graph), sam.result)
    const m = pixels(await loadImage(viewUrl(ref)), w, h)
    const data = new Uint8ClampedArray(w * h * 4)
    let count = 0
    for (let p = 0; p < data.length; p += 4) {
      if (m[p] < 128 || textMask[p + 3] || union[p + 3]) continue
      data.set(orig.subarray(p, p + 3), p)
      data[p + 3] = union[p + 3] = 255
      count++
    }
    if (count < MIN_OBJECT * w * h) continue
    const layer = await cropLayer(data, w, h)
    if (layer) layers.push(layer)
  }
  return { layers, union }
}

export function editElements(editor: Editor, shape: TLImageShape, onError: ErrorSink) {
  const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null
  if (asset?.type !== 'image' || !asset.props.src) return
  const { src, name, w, h } = asset.props
  const holder = spawnHolder(editor, shape)
  const extra: { layers: TextLayer[]; objects: RegionLayer[]; base: string; source: string } = { layers: [], objects: [], base: name, source: src }
  void startJob(editor, holder, (async () => {
    extra.layers = layersOf(await readLines(src), await loadImage(src))
    const { layers, union } = await objectLayers(src, w, h, extra.layers)
    extra.objects = layers
    if (!extra.layers.length && !layers.length) throw new Error(t('elements.nothingFound'))
    const mask = await maskFile(w, h, (ctx) => {
      paintBoxes(ctx, extra.layers, MASK_PAD)
      ctx.drawImage(grow(union, w, h, OBJECT_GROW), 0, 0)
    })
    return eraseGraph(annotated(src), mask)
  })(), { name: t('elements.jobName', name), placer: 'textLayers', extra }, onError)
  return holder
}

export function rerender(editor: Editor, frame: TLFrameShape, onError: ErrorSink) {
  const holder = spawnHolder(editor, frame)
  const { w, h, name } = frame.props
  void startJob(editor, holder, (async () => {
    const { blob } = await exportImage(editor, [frame.id], { format: 'png', background: true, scale: Math.min(RERENDER_SCALE, RERENDER_LONG / Math.max(w, h)) })
    const ref = await uploadImage(blob, `${name || 'elements'}-rerender.png`)
    return editGraph(annotated(viewUrl(ref)), RERENDER_PROMPT)
  })(), { name: t('elements.rerenderName', name) }, onError)
  return holder
}

registerPlacer('textLayers', async (editor, holder, [plate], job) => {
  const { layers, objects, base, source } = job.extra as { layers: TextLayer[]; objects: RegionLayer[]; base: string; source: string }
  const fw = (holder.props as { w: number }).w
  const k = fw / plate.w
  const frame = createShapeId()
  editor.run(() => {
    editor.deleteShape(holder.id)
    editor.createShape<TLFrameShape>({ id: frame, type: 'frame', x: holder.x, y: holder.y, parentId: holder.parentId, props: { w: fw, h: plate.h * k, name: t('elements.frameName', base) }, meta: { elements: source } })
    placeMedia(editor, plate, t('elements.background', base), 0, 0, fw, frame)
    objects.forEach((o, i) => placeMedia(editor, o.media, t('elements.object', base, i + 1), o.x * k, o.y * k, o.media.w * k, frame))
    const measure = document.createElement('canvas').getContext('2d')!
    for (const l of layers) {
      measure.font = `${l.weight} ${PROBE_SIZE}px ${FONT}`
      const size = Math.min(l.h * k * MAX_SIZE_PER_HEIGHT, (PROBE_SIZE * l.w * k * TEXT_FILL) / measure.measureText(l.text).width)
      const [cos, sin] = [Math.cos(l.angle), Math.sin(l.angle)]
      const [hw, hh] = [(l.w * k) / 2, size / 2]
      editor.createShape<TextShape>({
        id: createShapeId(), type: TEXT, parentId: frame,
        x: l.cx * k - hw * cos + hh * sin, y: l.cy * k - hw * sin - hh * cos, rotation: l.angle,
        props: { text: l.text, size, font: FONT, color: l.color, weight: l.weight, line: 1 },
      })
    }
  }, { history: 'ignore' })
  selectResults(editor, holder, [frame])
})
