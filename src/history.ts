import type { TLEditorSnapshot } from 'tldraw'

import { deleteUserFile, listUserFiles, readUserJson, writeUserJson } from './comfy'

const INTERVAL = 5 * 60 * 1000
const KEEP = 30

export interface Version { file: string; time: number; count: number }

const dir = (id: string) => `comfyart/history/${id}`
let last = 0

export async function listVersions(id: string): Promise<Version[]> {
  const files = await listUserFiles(dir(id))
  return files.flatMap((file) => {
    const m = /^(\d+)-(\d+)\.json$/.exec(file)
    return m ? [{ file, time: Number(m[1]), count: Number(m[2]) }] : []
  }).sort((a, b) => b.time - a.time)
}

export async function saveVersion(id: string, snapshot: TLEditorSnapshot, count: number) {
  last = Date.now()
  await writeUserJson(`${dir(id)}/${last}-${count}.json`, snapshot)
  const old = (await listVersions(id)).slice(KEEP)
  await Promise.all(old.map((v) => deleteUserFile(`${dir(id)}/${v.file}`)))
}

export function maybeSaveVersion(id: string, snapshot: () => TLEditorSnapshot, count: number) {
  if (Date.now() - last < INTERVAL) return
  void saveVersion(id, snapshot(), count)
}

export async function loadVersion(id: string, file: string): Promise<TLEditorSnapshot> {
  const snapshot = await readUserJson<TLEditorSnapshot | null>(`${dir(id)}/${file}`, null)
  if (!snapshot) throw new Error(`version ${file} not found`)
  return snapshot
}
