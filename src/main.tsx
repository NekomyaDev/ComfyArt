import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { initLocale } from './i18n'
import './styles/canvas.css'
import './styles/shell.css'
import './styles/overlays.css'

await initLocale()
const params = new URL(location.href).searchParams
const project = params.get('project')
const root = createRoot(document.getElementById('root')!)

if (project) {
  const { App } = await import('./App')
  root.render(<StrictMode><App id={project} /></StrictMode>)
} else {
  const { HomeApp } = await import('./home/HomeApp')
  root.render(<StrictMode><HomeApp view={params.get('view') === 'projects' ? 'projects' : 'home'} /></StrictMode>)
}
