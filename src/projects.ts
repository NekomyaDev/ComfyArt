import type { TLEditorSnapshot, TLRecord } from 'tldraw'

import { deleteProjectChats } from './bot'
import { deleteUserFile, listUserFiles, readUserJson, writeUserJson } from './comfy'
import { t } from './i18n'
import { uuid } from './id'

export const UNTITLED = t('projectHeader.untitled')
const DIR = 'comfyart/projects'
const HISTORY = 'comfyart/history'
const COVERS = 2

const filePath = (id: string) => `${DIR}/${id}.json`

export const loadProject = (id: string) => readUserJson<TLEditorSnapshot | null>(filePath(id), null)

export const saveProject = (id: string, snapshot: TLEditorSnapshot) => writeUserJson(filePath(id), snapshot)

export interface ProjectEntry { id: string; name: string; updated: number; covers?: string[]; pinned?: boolean }

const INDEX = 'comfyart/index.json'
type ProjectIndex = Record<string, Omit<ProjectEntry, 'id'>>

const readIndex = () => readUserJson<ProjectIndex>(INDEX, {})

export async function listProjects(): Promise<ProjectEntry[]> {
  return Object.entries(await readIndex()).map(([id, e]) => ({ id, ...e })).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated)
}

export function coversOf(records: TLRecord[]): string[] {
  const srcs = new Map<string, string>()
  for (const r of records) if (r.typeName === 'asset' && r.type === 'image' && r.props.src?.startsWith('/')) srcs.set(r.id, r.props.src)
  const used = records.flatMap((r) => (r.typeName === 'shape' && r.type === 'image' && r.props.assetId && srcs.has(r.props.assetId) ? [srcs.get(r.props.assetId)!] : []))
  return [...new Set(used)].slice(-COVERS).reverse()
}

export async function touchProject(id: string, name: string, covers: string[]) {
  const index = await readIndex()
  index[id] = { ...index[id], name, updated: Date.now(), covers }
  await writeUserJson(INDEX, index)
}

export async function fillCovers(entries: ProjectEntry[]): Promise<ProjectEntry[]> {
  const missing = entries.filter((e) => !e.covers)
  if (!missing.length) return entries
  const found = await Promise.all(missing.map(async (e) => [e.id, coversOf(Object.values((await loadProject(e.id))?.document.store ?? {}))] as const))
  const index = await readIndex()
  for (const [id, covers] of found) if (index[id]) index[id].covers = covers
  await writeUserJson(INDEX, index)
  return entries.map((e) => ({ ...e, covers: index[e.id]?.covers ?? e.covers }))
}

export async function renameProject(id: string, name: string) {
  const snapshot = await loadProject(id)
  const doc = snapshot?.document.store['document:document' as TLRecord['id']]
  if (snapshot && doc?.typeName === 'document') {
    snapshot.document.store[doc.id] = { ...doc, name }
    await saveProject(id, snapshot)
  }
  const index = await readIndex()
  if (index[id]) index[id] = { ...index[id], name }
  await writeUserJson(INDEX, index)
}

export async function deleteProjects(ids: string[]) {
  for (const id of ids) {
    const versions = await listUserFiles(`${HISTORY}/${id}`)
    await Promise.all([deleteUserFile(filePath(id)), ...versions.map((f) => deleteUserFile(`${HISTORY}/${id}/${f}`)), deleteProjectChats(id)])
  }
  const index = await readIndex()
  for (const id of ids) delete index[id]
  await writeUserJson(INDEX, index)
}

export function projectUrl(id: string, params: Record<string, string | string[]> = {}) {
  const url = new URL(location.pathname, location.origin)
  url.searchParams.set('project', id)
  for (const [k, v] of Object.entries(params)) for (const x of [v].flat()) url.searchParams.append(k, x)
  return url.toString()
}

export function openProject(id: string) {
  location.assign(projectUrl(id))
}

export const NEW_PARAM = 'new'

export function newProject(params: Record<string, string | string[]> = {}) {
  location.assign(projectUrl(uuid().slice(0, 8), { [NEW_PARAM]: '1', ...params }))
}

export async function projectExists(id: string) {
  return (await loadProject(id)) !== null
}

export async function setPinned(id: string, pinned: boolean) {
  const index = await readIndex()
  if (!index[id]) return
  index[id] = { ...index[id], pinned: pinned || undefined }
  await writeUserJson(INDEX, index)
}

export async function duplicateProject(id: string): Promise<string> {
  const snapshot = await loadProject(id)
  const entry = (await readIndex())[id]
  if (!snapshot || !entry) throw new Error(t('home.projectNotFound'))
  const copy = uuid().slice(0, 8)
  const name = t('projects.copyName', entry.name || UNTITLED)
  const doc = snapshot.document.store['document:document' as TLRecord['id']]
  if (doc?.typeName === 'document') snapshot.document.store[doc.id] = { ...doc, name }
  await saveProject(copy, snapshot)
  const index = await readIndex()
  index[copy] = { name, updated: Date.now(), covers: entry.covers }
  await writeUserJson(INDEX, index)
  return copy
}

export function openView(view: 'home' | 'projects') {
  const url = new URL(location.pathname, location.origin)
  if (view === 'projects') url.searchParams.set('view', 'projects')
  location.assign(url)
}
