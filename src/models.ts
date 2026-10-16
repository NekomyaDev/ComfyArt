import { atom } from 'tldraw'

import { api, loadModelPaths, readUserJson, writeUserJson } from './comfy'
import { t } from './i18n'

export interface ModelDef {
  id: string
  label: string
  desc: string
  files: string[]
  video?: boolean
  refs?: 'qwen' | 'latent'
  prompt?: string
  seed?: [string, string]
  steps?: [string, Record<string, number>]
  sizes?: string[]
  vae?: string
  caption?: string
  control?: string
}

export const IMAGE_MODELS: ModelDef[] = [
  {
    id: 'qwen-image-2.1-t2i.api.json', label: 'Qwen Image 2.1', desc: t('models.highOverallQualityAccurateChinese'), files: ['qwen_image_2.1_int8_convrot.safetensors'],
    refs: 'qwen', prompt: 'prompt', seed: ['7', 'seed'], steps: ['7', { fast: 12, standard: 25, high: 40 }], sizes: ['5'], vae: '4',
  },
  {
    id: 'z-image-turbo-t2i.api.json', label: 'Z-Image Turbo', desc: t('models.fast8StepGenerationGreat'), files: ['z_image_turbo_bf16.safetensors'],
    prompt: 'text', seed: ['7', 'seed'], sizes: ['5'], vae: '3',
  },
  {
    id: 'flux2-klein-9b-t2i.api.json', label: 'Flux.2 Klein 9B', desc: t('models.fast4StepGenerationSupports'), files: ['flux-2-klein-9b-nvfp4.safetensors'],
    refs: 'latent', prompt: 'text', seed: ['14', 'noise_seed'], sizes: ['5', '13'], vae: '3',
  },
  {
    id: 'qwen-image-2512-t2i.api.json', label: 'Qwen Image 2512', desc: t('models.solidDetailAndCompositionSupports'), files: ['qwen_image_2512_fp8_e4m3fn.safetensors'],
    prompt: 'text', seed: ['7', 'seed'], steps: ['7', { fast: 20, standard: 30, high: 50 }], sizes: ['5'], vae: '3', control: 'Qwen-Image-2512-Fun-Controlnet-Union-2602.safetensors',
  },
  {
    id: 'ideogram4-t2i.api.json', label: 'Ideogram 4', desc: t('models.greatAtLayoutLogosAnd'), files: ['ideogram4_fp8_scaled.safetensors', 'ideogram4_unconditional_fp8_scaled.safetensors'],
    prompt: 'text', caption: 'ideogram4-caption.json',
    seed: ['14', 'noise_seed'], steps: ['13', { fast: 12, standard: 20, high: 48 }], sizes: ['5', '13'], vae: '3',
  },
]

export const VIDEO_MODELS: ModelDef[] = [
  { id: 't2v-minimax-h3.api.json', label: 'MiniMax H3', desc: t('models.syncedAudioAndVideoSupports'), files: ['minimax_h3_fl2va_pruned_int8_convrot.safetensors'], video: true },
]

export const isVideo = (workflow: string) => VIDEO_MODELS.some((m) => m.id === workflow)
export const modelOf = (workflow: string) => [...IMAGE_MODELS, ...VIDEO_MODELS].find((m) => m.id === workflow)

export interface ModelPrefs { auto: boolean; enabled: string[] }

const FILE = 'comfyart/models.json'
const ALL = [...IMAGE_MODELS, ...VIDEO_MODELS].map((m) => m.id)

export const modelPrefsAtom = atom<ModelPrefs>('model prefs', { auto: true, enabled: ALL })
export const installedAtom = atom<string[] | null>('installed models', null)

export async function loadModels() {
  const [prefs, files, paths] = await Promise.all([readUserJson<ModelPrefs | null>(FILE, null), api('/models/diffusion_models'), loadModelPaths()])
  if (prefs) modelPrefsAtom.set(prefs)
  const names: string[] = files.ok ? await files.json() : []
  installedAtom.set([...IMAGE_MODELS, ...VIDEO_MODELS].filter((m) => m.files.every((f) => names.includes(f) || f in paths)).map((m) => m.id))
}

export async function saveModelPrefs(prefs: ModelPrefs) {
  modelPrefsAtom.set(prefs)
  await writeUserJson(FILE, prefs)
}

export function installedModels(video: boolean): ModelDef[] {
  const installed = installedAtom.get()
  return (video ? VIDEO_MODELS : IMAGE_MODELS).filter((m) => !installed || installed.includes(m.id))
}

export function agentModels(video: boolean): ModelDef[] {
  const { auto, enabled } = modelPrefsAtom.get()
  const list = installedModels(video)
  const picked = auto ? list : list.filter((m) => enabled.includes(m.id))
  return picked.length ? picked : list.slice(0, 1)
}
