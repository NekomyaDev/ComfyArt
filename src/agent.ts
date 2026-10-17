import { atom, type Editor, type TLImageShape, type TLShapeId } from 'tldraw'

import { botEnabledAtom, logDirect, sendMessage } from './bot'
import { createGenerator, DURATIONS, generate, MAX_SCENES, MAX_STORY_SECONDS, nearestRatio, VIDEO_RATIOS } from './generate'
import type { ErrorSink } from './jobs'
import { describeItem, itemImages, linkedKit, type LibraryItem } from './library'
import { ask, ocrLines, parseJson } from './llm'
import { memoryPrompt } from './memory'
import { modelOf } from './models'
import { GENERATOR, type GeneratorShape } from './shapes/GeneratorShape'
import type { Skill } from './skills'
import { t } from './i18n'

export type AgentMode = 'agent' | 'image' | 'video'

export const draftAtom = atom('agent draft', '')
export const extraRefsAtom = atom<TLShapeId[]>('agent refs', [])
export const agentModeAtom = atom<AgentMode>('agent mode', 'agent')
export const kitsAtom = atom<LibraryItem[]>('agent kits', [])

const MAX_DIRECT_REFS = 4

export function srcOf(editor: Editor, shape: TLImageShape): string | null {
  return shape.props.assetId ? editor.getAsset(shape.props.assetId)?.props.src ?? null : null
}

function imageName(editor: Editor, shape: TLImageShape): string {
  const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null
  return (asset?.type === 'image' && asset.props.name) || ''
}

export async function sendToAgent(editor: Editor, text: string, refs: TLImageShape[], skill: Skill | null, kits: LibraryItem[] = []) {
  const linked = linkedKit(editor.getDocumentSettings().meta.brandKit)
  if (linked && !kits.some((k) => k.id === linked.id)) kits = [...kits, linked]
  await sendMessage({
    text,
    refs: refs.flatMap((r) => {
      const src = srcOf(editor, r)
      return src ? [{ id: r.id, src, name: imageName(editor, r), kind: 'image' as const }] : []
    }),
    kits: kits.map((k) => ({ name: k.name, description: describeItem(k), images: itemImages(k) })),
    ...(skill ? { skill: skill.name } : {}),
    memory: memoryPrompt(),
  })
}

export async function generateDirect(editor: Editor, text: string, refs: TLImageShape[], video: boolean, onError: ErrorSink) {
  const ratio = video ? (refs[0] ? nearestRatio(refs[0].props.w / refs[0].props.h, VIDEO_RATIOS) : VIDEO_RATIOS[0]) : '1:1'
  const srcs = refs.flatMap((r) => srcOf(editor, r) ?? []).slice(0, video ? 1 : MAX_DIRECT_REFS)
  const holder = createGenerator(editor, video, video ? { prompt: text, ratio } : { prompt: text, ratio, count: 1 }, false)
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
