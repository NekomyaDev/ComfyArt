import { atom, type Editor } from 'tldraw'

export type Theme = 'light' | 'dark' | 'system'

const KEY = 'comfyart.theme'

export const themeAtom = atom<Theme>('theme', (() => {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'dark' || stored === 'system' ? stored : 'light'
  } catch { return 'light' }
})())

export function setTheme(editor: Editor, theme: Theme) {
  themeAtom.set(theme)
  try { localStorage.setItem(KEY, theme) } catch { }
  editor.user.updateUserPreferences({ colorScheme: theme })
}

export function markDark(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

markDark(themeAtom.get() === 'dark' || (themeAtom.get() === 'system' && matchMedia('(prefers-color-scheme: dark)').matches))
