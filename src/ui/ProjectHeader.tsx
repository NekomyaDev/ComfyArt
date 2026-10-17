import { useState, type ReactNode } from 'react'
import { useValue, type Editor } from 'tldraw'

import { libraryAtom } from '../library'
import { listProjects, openProject, type ProjectEntry } from '../projects'
import { setTheme, themeAtom, type Theme } from '../theme'
import { historyAtom } from './HistoryDialog'
import { Icons } from './icons'
import { memoryOpenAtom } from './MemoryDialog'
import { Popover } from './Popover'
import { t } from '../i18n'
import { uuid } from '../id'

export const UNTITLED = t('projectHeader.untitled')
const THEMES: [Theme, string][] = [['light', t('projectHeader.themeLight')], ['dark', t('projectHeader.themeDark')], ['system', t('projectHeader.themeSystem')]]

export function ProjectHeader({ editor, projectId, children }: { editor: Editor; projectId: string; children?: ReactNode }) {
  const name = useValue('doc name', () => editor.getDocumentSettings().name, [editor])
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const kits = useValue('brand kits', () => libraryAtom.get().filter((x) => x.kind === 'brand'), [])
  const theme = useValue(themeAtom)
  const linked = useValue('linked kit', () => editor.getDocumentSettings().meta.brandKit ?? null, [editor])
  const link = (id: string | null) => {
    const doc = editor.getDocumentSettings()
    editor.updateDocumentSettings({ meta: { ...doc.meta, brandKit: linked === id ? null : id } })
  }

  const toggle = (o: boolean) => {
    setOpen(o)
    if (o) void listProjects().then(setProjects)
  }

  return (
    <div className="ca-head" onPointerDown={(e) => e.stopPropagation()}>
      <Popover
        open={open}
        onOpenChange={toggle}
        trigger={({ open: o, toggle: flip }) => (
          <button type="button" className="ca-head__logo" title={t('projectHeader.projects')} data-open={o || undefined} onClick={flip}>{Icons.agent}</button>
        )}
      >
        <div className="ca-menu ca-head__list">
          <button type="button" className="ca-menu__item" onClick={() => openProject(uuid().slice(0, 8))}>
            <span className="ca-icon">{Icons.plus}</span><span className="ca-menu__grow">{t('projectHeader.newProject')}</span>
          </button>
          <button type="button" className="ca-menu__item" onClick={() => { setOpen(false); historyAtom.set(true) }}>
            <span className="ca-icon">{Icons.restore}</span><span className="ca-menu__grow">{t('historyDialog.canvasHistory')}</span>
          </button>
          <button type="button" className="ca-menu__item" onClick={() => { setOpen(false); memoryOpenAtom.set(true) }}>
            <span className="ca-icon">{Icons.memory}</span><span className="ca-menu__grow">{t('common.memory')}</span>
          </button>
          <div className="ca-menu__sep" />
          <div className="ca-gen__label">{t('projectHeader.theme')}</div>
          {THEMES.map(([value, label]) => (
            <button key={value} type="button" className="ca-menu__item" onClick={() => setTheme(editor, value)}>
              <span className="ca-menu__grow">{label}</span>
              {theme === value && <span className="ca-icon">{Icons.check}</span>}
            </button>
          ))}
          {kits.length > 0 && (
            <>
              <div className="ca-menu__sep" />
              <div className="ca-gen__label">{t('projectHeader.projectBrandKit')}</div>
              {kits.map((k) => (
                <button key={k.id} type="button" className="ca-menu__item" onClick={() => link(k.id)}>
                  <span className="ca-icon">{Icons.palette}</span><span className="ca-menu__grow">{k.name}</span>
                  {linked === k.id && <span className="ca-icon">{Icons.check}</span>}
                </button>
              ))}
            </>
          )}
          <div className="ca-menu__sep" />
          <div className="ca-gen__label">{t('projectHeader.allProjects')}</div>
          {projects.map((p) => (
            <button key={p.id} type="button" className="ca-menu__item" onClick={() => p.id !== projectId && openProject(p.id)}>
              <span className="ca-menu__grow">{p.name || UNTITLED}</span>
              {p.id === projectId && <span className="ca-icon">{Icons.check}</span>}
            </button>
          ))}
        </div>
      </Popover>
      <input
        className="ca-head__name"
        value={name}
        placeholder={UNTITLED}
        onChange={(e) => editor.updateDocumentSettings({ name: e.target.value })}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      {children}
    </div>
  )
}
