import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { initLocale } from './i18n'
import './styles/canvas.css'
import './styles/shell.css'
import './styles/overlays.css'

await initLocale()
const { App } = await import('./App')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
