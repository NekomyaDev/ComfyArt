import en from './locales/en.json'
import zh from './locales/zh.json'

export type Lang = 'zh' | 'en'

const MESSAGES: Record<Lang, Record<string, string>> = { zh, en }

const KEY = 'comfyart.lang'

export let lang: Lang = 'en'

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'zh' || v === 'en' ? v : null
  } catch { return null }
}

export async function initLocale() {
  const stored = storedLang()
  if (stored) lang = stored
  else {
    const res = await fetch('/api/settings/Comfy.Locale').catch(() => null)
    const value = res?.ok ? await res.json().catch(() => null) : null
    lang = String(value || navigator.language).toLowerCase().startsWith('zh') ? 'zh' : 'en'
  }
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
}

export function setLang(next: Lang) {
  try { localStorage.setItem(KEY, next) } catch { }
  location.reload()
}

export function t(key: string, ...args: (string | number)[]): string {
  const text = MESSAGES[lang][key] ?? MESSAGES.zh[key] ?? key
  return args.length ? text.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m)) : text
}
