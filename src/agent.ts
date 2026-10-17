import { atom, type Editor, type TLImageShape, type TLShapeId, type TLVideoShape } from 'tldraw'

import { commentTarget } from './actions'
import { botEnabledAtom, logDirect, sendMessage } from './bot'
import { createGenerator, DURATIONS, generate, MAX_SCENES, MAX_STORY_SECONDS, nearestRatio, VIDEO_RATIOS } from './generate'
import { uploadImage, viewUrl } from './comfy'
import { placeMedia, toMedia, type ErrorSink } from './jobs'
import { describeItem, itemImages, linkedKit, type LibraryItem } from './library'
import { ask, ocrLines, parseJson } from './llm'
import { memoryPrompt } from './memory'
import { modelOf } from './models'
import type { CommentShape } from './shapes/CommentShape'
import { GENERATOR, type GeneratorShape } from './shapes/GeneratorShape'
import type { Skill } from './skills'
import { t } from './i18n'

export type AgentMode = 'agent' | 'image' | 'video'

export const draftAtom = atom('agent draft', '')
export const extraRefsAtom = atom<TLShapeId[]>('agent refs', [])
export const agentModeAtom = atom<AgentMode>('agent mode', 'agent')
export const kitsAtom = atom<LibraryItem[]>('agent kits', [])

const MAX_DIRECT_REFS = 4

export type RefShape = TLImageShape | TLVideoShape

export function srcOf(editor: Editor, shape: RefShape): string | null {
  return shape.props.assetId ? editor.getAsset(shape.props.assetId)?.props.src ?? null : null
}

function mediaName(editor: Editor, shape: RefShape): string {
  const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null
  return (asset?.type === shape.type && asset.props.name) || ''
}

const REF_LONG = 512

export async function uploadRefs(editor: Editor, files: File[]) {
  for (const f of files.filter((x) => x.type.startsWith('image/'))) {
    const ref = await uploadImage(f, f.name)
    const m = await toMedia(ref, 'image')
    const center = editor.getViewportPageBounds().center
    const w = Math.min(m.w, REF_LONG)
    const id = placeMedia(editor, { ...m, src: viewUrl(ref) }, f.name, center.x - w / 2, center.y - w * m.h / m.w / 2, w)
    extraRefsAtom.set([...extraRefsAtom.get().filter((x) => x !== id), id])
  }
}

export async function sendToAgent(editor: Editor, text: string, refs: RefShape[], skill: Skill | null, kits: LibraryItem[] = []) {
  const linked = linkedKit(editor.getDocumentSettings().meta.brandKit)
  if (linked && !kits.some((k) => k.id === linked.id)) kits = [...kits, linked]
  await sendMessage({
    text,
    refs: refs.flatMap((r) => {
      const src = srcOf(editor, r)
      return src ? [{ id: r.id, src, name: mediaName(editor, r), kind: r.type }] : []
    }),
    kits: kits.map((k) => ({ name: k.name, description: describeItem(k), images: itemImages(k) })),
    ...(skill ? { skill: skill.name } : {}),
    memory: memoryPrompt(),
  })
}

export function commentNotes(editor: Editor, comments: CommentShape[]) {
  const images: TLImageShape[] = []
  const lines = comments.map((c) => {
    const text = `- ${c.props.text.trim()}`
    const target = commentTarget(editor, c)
    if (!target) return text
    if (!images.some((s) => s.id === target.shape.id)) images.push(target.shape)
    const r = target.region
    return `${text} [on ${target.shape.id}, region x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.w)} h=${Math.round(r.h)} of ${target.src.w}×${target.src.h} px]`
  })
  return { text: lines.join('\n'), images }
}

export function commentsToChat(editor: Editor, comments: CommentShape[]) {
  const { text, images } = commentNotes(editor, comments)
  draftAtom.set([draftAtom.get(), text].filter(Boolean).join('\n'))
  extraRefsAtom.set([...new Set([...extraRefsAtom.get(), ...images.map((s) => s.id)])])
}

export type DirectSettings = Partial<GeneratorShape['props']>
export const directSettingsAtom = atom<Record<'image' | 'video', DirectSettings>>('direct settings', { image: {}, video: {} })

export async function generateDirect(editor: Editor, text: string, all: RefShape[], video: boolean, onError: ErrorSink) {
  const refs = all.filter((r): r is TLImageShape => r.type === 'image')
  const settings = directSettingsAtom.get()[video ? 'video' : 'image']
  const picked = settings.ratio ?? (video ? VIDEO_RATIOS[0] : '1:1')
  const ratio = video && refs[0] ? nearestRatio(refs[0].props.w / refs[0].props.h, VIDEO_RATIOS) : picked
  const srcs = refs.flatMap((r) => srcOf(editor, r) ?? []).slice(0, video ? 1 : MAX_DIRECT_REFS)
  const holder = createGenerator(editor, video, { ...settings, prompt: text, ratio }, false)
  if (srcs.length) editor.updateShape<GeneratorShape>({ id: holder, type: GENERATOR, meta: { refs: srcs } })
  void generate(editor, editor.getShape<GeneratorShape>(holder)!, onError)
  const model = modelOf(editor.getShape<GeneratorShape>(holder)!.props.workflow)?.label
  if (!botEnabledAtom.get()) return
  await logDirect(text, [{
    type: 'task',
    label: t('agent.directLabel', video ? t('dock.videoGeneration') : t('dock.imageGeneration'), ratio),
    holder,
    detail: { tool: video ? 'generate_video' : 'generate_image', prompt: text, ...(model ? { model } : {}), params: { aspect_ratio: ratio, ...(srcs.length ? { references: srcs.length } : {}) } },
  }])
}

const STORY_SYSTEM = `Split a video idea into a storyboard. Reply with ONE JSON object and nothing else: {"scenes": [{"prompt": "<detailed English shot description with camera motion and sound>", "duration": ${DURATIONS.join('|')}}]}. Use 2-${MAX_SCENES} scenes, keep characters and style consistent, total duration at most ${MAX_STORY_SECONDS} seconds.`

export async function planStoryboard(idea: string): Promise<{ prompt: string; duration: number }[]> {
  const scenes = parseJson(await ask(idea, STORY_SYSTEM, []))?.scenes
  if (!Array.isArray(scenes)) throw new Error(t('agent.smartStoryboardFailedPleaseTry'))
  const out: { prompt: string; duration: number }[] = []
  for (const s of scenes.slice(0, MAX_SCENES)) {
    const duration = DURATIONS.includes(Number(s?.duration)) ? Number(s.duration) : DURATIONS[0]
    if (!s?.prompt || out.reduce((n, x) => n + x.duration, duration) > MAX_STORY_SECONDS) continue
    out.push({ prompt: String(s.prompt), duration })
  }
  return out
}

export async function extractText(editor: Editor, shape: TLImageShape): Promise<string> {
  const src = srcOf(editor, shape)
  if (!src) return ''
  return (await ocrLines(src)).join('\n')
}
