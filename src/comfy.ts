import { CLIENT_ID } from './ws'

const POLL_MS = 1500

export type PromptGraph = Record<string, { class_type: string; inputs: Record<string, unknown> }>

export interface ImageRef { filename: string; subfolder: string; type: string; metadata?: { width?: number; height?: number } }

function comfyUser(): string | null {
  try { return localStorage.getItem('Comfy.userId') } catch { return null }
}

export function api(path: string, init?: RequestInit) {
  const user = comfyUser()
  return fetch(`/api${path}`, user ? { ...init, headers: { ...init?.headers, 'Comfy-User': user } } : init)
}

const userFile = (path: string) => `/userdata/${encodeURIComponent(path)}`

export async function readUserText(path: string): Promise<string | null> {
  const res = await api(userFile(path))
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`read ${path} failed: ${res.status}`)
  return res.text()
}

export async function readUserJson<T>(path: string, fallback: T): Promise<T> {
  const text = await readUserText(path)
  return text === null ? fallback : JSON.parse(text)
}

export async function writeUserText(path: string, body: string) {
  const res = await api(`${userFile(path)}?overwrite=true&full_info=false`, { method: 'POST', body })
  if (!res.ok) throw new Error(`save ${path} failed: ${res.status}`)
}

export const writeUserJson = (path: string, data: unknown) => writeUserText(path, JSON.stringify(data))

export async function listUserFiles(dir: string, recurse = false): Promise<string[]> {
  const res = await api(`/userdata?dir=${encodeURIComponent(dir)}${recurse ? '&recurse=true&split=false&full_info=false' : ''}`)
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`list ${dir} failed: ${res.status}`)
  return ((await res.json()) as string[]).map((f) => f.replaceAll('\\', '/'))
}

export async function deleteUserFile(path: string) {
  await api(userFile(path), { method: 'DELETE' })
}

export function viewUrl(ref: ImageRef): string {
  const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder, type: ref.type })
  return `/api/view?${q}`
}

export function thumbUrl(src: string, max = 256): string {
  return `/comfyart/thumb?${new URLSearchParams({ url: src, max: String(max) })}`
}

export function refFromUrl(src: string): ImageRef {
  const q = new URL(src, location.origin).searchParams
  return { filename: q.get('filename') ?? '', subfolder: q.get('subfolder') ?? '', type: q.get('type') ?? 'input' }
}

export async function uploadImage(file: Blob, name: string): Promise<ImageRef> {
  const body = new FormData()
  body.append('image', file, name)
  body.append('subfolder', 'comfyart')
  body.append('type', 'input')
  const res = await api('/upload/image', { method: 'POST', body })
  if (!res.ok) throw new Error(`upload failed: ${res.status}`)
  const data = await res.json()
  return { filename: data.name, subfolder: data.subfolder ?? 'comfyart', type: data.type ?? 'input' }
}

export async function loadWorkflow(name: string): Promise<PromptGraph> {
  const res = await fetch(`/comfyart/workflows/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`workflow ${name} not found`)
  return res.json()
}

export async function queuePrompt(prompt: PromptGraph): Promise<string> {
  const res = await api('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, client_id: CLIENT_ID }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error?.message ?? `queue failed: ${res.status}`)
  return String(body.prompt_id)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitForOutput<T>(promptId: string, node: string, pick: (out: Record<string, any>) => T | null): Promise<T> {
  for (;;) {
    const hist = (await (await api(`/history/${promptId}`)).json())[promptId]
    if (hist) {
      const err = (hist.status?.messages ?? []).find((m: any) => m[0] === 'execution_error')
      if (err) throw new Error(String(err[1]?.exception_message ?? 'execution failed'))
      const value = hist.outputs?.[node] ? pick(hist.outputs[node]) : null
      if (value) return value
      if (hist.status?.completed) throw new Error('the workflow produced no output')
    }
    await sleep(POLL_MS)
  }
}

export function waitForImages(promptId: string, node: string): Promise<ImageRef[]> {
  return waitForOutput(promptId, node, (out) => {
    const items = [...(out.images ?? []), ...(out.videos ?? []), ...(out.gifs ?? [])]
    return items.length ? items as ImageRef[] : null
  })
}

export function waitForText(promptId: string, node: string): Promise<string> {
  return waitForOutput(promptId, node, (out) => (out.text ? String(out.text.join('')) : null))
}
