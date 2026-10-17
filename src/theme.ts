import { atom, type Editor } from 'tldraw'

import { t } from './i18n'

export type Theme = 'light' | 'dark' | 'system'
export const THEMES: [Theme, string][] = [['light', t('projectHeader.themeLight')], ['dark', t('projectHeader.themeDark')], ['system', t('projectHeader.themeSystem')]]

const KEY = 'comfyart.theme'

export const themeAtom = atom<Theme>('theme', (() => {
  try {
    const stored = localStorage.getItem(KEY)
    return stored === 'dark' || stored === 'system' ? stored : 'light'
  } catch { return 'light' }
})())

const isDark = (theme: Theme) => theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)

export function saveTheme(theme: Theme) {
  themeAtom.set(theme)
  try { localStorage.setItem(KEY, theme) } catch { }
  markDark(isDark(theme))
}

export function setTheme(editor: Editor, theme: Theme) {
  saveTheme(theme)
  editor.user.updateUserPreferences({ colorScheme: theme })
}

export function markDark(dark: boolean) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

markDark(isDark(themeAtom.get()))
