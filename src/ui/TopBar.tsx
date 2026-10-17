import { useState } from 'react'
import { useValue, type Editor, type TLPageId } from 'tldraw'

import { allComments } from './CommentsList'
import { confirmAtom } from './Confirm'
import { Icons } from './icons'
import { sideAtom } from './SidePanel'
import { setTheme } from '../theme'
import { t } from '../i18n'

export function TopBar({ editor, left }: { editor: Editor; left?: React.ReactNode }) {
  const pages = useValue('pages', () => editor.getPages(), [editor])
  const current = useValue('current page', () => editor.getCurrentPageId(), [editor])
  const [renaming, setRenaming] = useState<TLPageId | null>(null)
  const side = useValue(sideAtom)
  const dark = useValue('dark mode', () => editor.user.getIsDarkMode(), [editor])
  const openComments = useValue('open comments', () => allComments(editor).filter((c) => !c.props.done).length, [editor])

  const add = () => {
    const name = t('topBar.page', pages.length + 1)
    editor.createPage({ name })
    const page = editor.getPages().at(-1)!
    editor.setCurrentPage(page.id)
  }

  return (
    <div className="ca-top" onPointerDown={(e) => e.stopPropagation()}>
      {left}
      <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('common.reference')} data-on={side === 'references' || undefined} onClick={() => sideAtom.set(side === 'references' ? null : 'references')}>
        <span className="ca-icon">{Icons.refs}</span>
      </button>
      <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('sidePanel.myAssets')} data-on={side === 'assets' || undefined} onClick={() => sideAtom.set(side === 'assets' ? null : 'assets')}>
        <span className="ca-icon">{Icons.assets}</span>
      </button>
      <div className="ca-bar__sep" />
      <div className="ca-tabs" role="tablist">
        {pages.map((p) => (
          <div key={p.id} role="tab" aria-selected={p.id === current} className="ca-tab" data-on={p.id === current || undefined} onClick={() => editor.setCurrentPage(p.id)} onDoubleClick={() => setRenaming(p.id)}>
            <span className="ca-icon">{Icons.page}</span>
            {renaming === p.id ? (
              <input
                autoFocus
                className="ca-tab__input"
                defaultValue={p.name}
                onBlur={(e) => { editor.renamePage(p.id, e.target.value.trim() || p.name); setRenaming(null) }}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <span className="ca-tab__name">{p.name}</span>
            )}
            {pages.length > 1 && (
              <button type="button" className="ca-tab__close" title={t('topBar.deletePage')} onClick={(e) => { e.stopPropagation(); confirmAtom.set({ title: t('topBar.deleteThisCanvasPage'), desc: t('topBar.everythingOnCanvasPageWill', p.name), ok: t('common.delete'), run: () => editor.deletePage(p.id) }) }}>
                <span className="ca-icon">{Icons.close}</span>
              </button>
            )}
          </div>
        ))}
        <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('topBar.newPage')} onClick={add}>
          <span className="ca-icon">{Icons.plus}</span>
        </button>
      </div>
      <div className="ca-gen__spacer" />
      <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={dark ? t('topBar.switchToLight') : t('topBar.switchToDark')} onClick={() => setTheme(editor, dark ? 'light' : 'dark')}>
        <span className="ca-icon">{dark ? Icons.sun : Icons.moon}</span>
      </button>
      <button type="button" className="ca-bar__btn" title={t('common.allComments')} data-on={side === 'comments' || undefined} onClick={() => sideAtom.set(side === 'comments' ? null : 'comments')}>
        <span className="ca-icon">{Icons.comment}</span>{openComments > 0 && <span className="ca-badge">{openComments}</span>}
      </button>
    </div>
  )
}
