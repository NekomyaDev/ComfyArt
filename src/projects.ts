import type { TLEditorSnapshot } from 'tldraw'

import { readUserJson, writeUserJson } from './comfy'

const DIR = 'comfyart/projects'

const filePath = (id: string) => `${DIR}/${id}.json`

export const loadProject = (id: string) => readUserJson<TLEditorSnapshot | null>(filePath(id), null)

export const saveProject = (id: string, snapshot: TLEditorSnapshot) => writeUserJson(filePath(id), snapshot)

export interface ProjectEntry { id: string; name: string; updated: number }

const INDEX = 'comfyart/index.json'
type ProjectIndex = Record<string, Omit<ProjectEntry, 'id'>>

export async function listProjects(): Promise<ProjectEntry[]> {
  const index = await readUserJson<ProjectIndex>(INDEX, {})
  return Object.entries(index).map(([id, e]) => ({ id, ...e })).sort((a, b) => b.updated - a.updated)
}

export async function touchProject(id: string, name: string) {
  const index = await readUserJson<ProjectIndex>(INDEX, {})
  index[id] = { name, updated: Date.now() }
  await writeUserJson(INDEX, index)
}

export function openProject(id: string, kit?: string) {
  const url = new URL(location.href)
  url.searchParams.set('project', id)
  if (kit) url.searchParams.set('kit', kit)
  else url.searchParams.delete('kit')
  location.assign(url)
}
