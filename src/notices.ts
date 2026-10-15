import { atom } from 'tldraw'

import { readUserJson, writeUserJson } from './comfy'

export type NoticeKind = 'task' | 'suggestion' | 'comment' | 'schedule'
export interface Notice { id: string; kind: NoticeKind; title: string; body?: string; time: number; read?: boolean; project: string; chat?: string; srcs?: string[] }

const FILE = 'comfyart/notices.json'
const MAX_NOTICES = 200
const PUSH_KEY = 'comfyart.notify'
const channel = new BroadcastChannel('comfyart-notices')

export const noticesAtom = atom<Notice[]>('notices', [])

export function currentProject(): string {
  return new URL(location.href).searchParams.get('project') ?? ''
}

export function pushEnabled() {
  try { return localStorage.getItem(PUSH_KEY) === '1' } catch { return false }
}

export async function setPush(on: boolean) {
  const next = on && (await Notification.requestPermission()) === 'granted'
  try { localStorage.setItem(PUSH_KEY, next ? '1' : '0') } catch { }
  return next
}

const read = () => readUserJson<Notice[]>(FILE, [])

export async function loadNotices() {
  noticesAtom.set(await read())
}

async function update(fn: (list: Notice[]) => Notice[]) {
  const list = fn(await read()).slice(0, MAX_NOTICES)
  noticesAtom.set(list)
  await writeUserJson(FILE, list)
  channel.postMessage('changed')
}

channel.onmessage = () => void loadNotices()

export function notify(n: Omit<Notice, 'id' | 'time' | 'project'> & { project?: string }) {
  const notice: Notice = { id: crypto.randomUUID().slice(0, 8), time: Date.now(), project: currentProject(), ...n }
  if (document.hidden && pushEnabled() && Notification.permission === 'granted') {
    new Notification(notice.title, { body: notice.body, icon: notice.srcs?.[0] })
  }
  return update((list) => [notice, ...list])
}

export const markRead = (ids?: string[]) => update((list) => list.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)))
export const removeNotice = (id: string) => update((list) => list.filter((n) => n.id !== id))
export const clearNotices = () => update(() => [])
