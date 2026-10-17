import { atom } from 'tldraw'

const KEY = 'comfyart.dock'

export const dockAtom = atom<'left' | 'right'>('chat dock', (() => {
  try { return localStorage.getItem(KEY) === 'right' ? 'right' : 'left' } catch { return 'left' }
})())

export function setDock(side: 'left' | 'right') {
  dockAtom.set(side)
  try { localStorage.setItem(KEY, side) } catch { }
}
