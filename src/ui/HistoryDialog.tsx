import { useEffect, useState } from 'react'
import { atom, getSnapshot, loadSnapshot, useValue, type Editor } from 'tldraw'

import { listVersions, loadVersion, saveVersion, type Version } from '../history'
import { errorText } from '../jobs'
import { confirmAtom } from './Confirm'
import { Icons } from './icons'
import { t } from '../i18n'

export const historyAtom = atom('canvas history', false)

function ago(time: number) {
  const m = Math.round((Date.now() - time) / 60000)
  if (m < 1) return t('historyDialog.justNow')
  if (m < 60) return t('historyDialog.minAgo', m)
  if (m < 60 * 24) return t('historyDialog.hAgo', Math.round(m / 60))
  return new Date(time).toLocaleString()
}

export function HistoryDialog({ editor, projectId, onError }: { editor: Editor; projectId: string; onError: (msg: string) => void }) {
  const open = useValue(historyAtom)
  const [versions, setVersions] = useState<Version[] | null>(null)

  useEffect(() => {
    if (!open) return
    setVersions(null)
    void listVersions(projectId).then(setVersions)
  }, [open, projectId])

  if (!open) return null
  const close = () => historyAtom.set(false)
  const restore = (v: Version) => confirmAtom.set({
    title: t('historyDialog.restoreThisVersion'),
    desc: t('historyDialog.theCurrentCanvasWillBe'),
    ok: t('historyDialog.restore'),
    run: async () => {
      try {
        await saveVersion(projectId, getSnapshot(editor.store), editor.getCurrentPageShapeIds().size)
        loadSnapshot(editor.store, await loadVersion(projectId, v.file))
        close()
      } catch (e) {
        onError(errorText(e))
      }
    },
  })

  return (
    <div className="ca-modal" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close() }}>
      <div className="ca-modal__card ca-rename">
        <div className="ca-side__head">
          <span>{t('historyDialog.canvasHistory')}</span>
          <button type="button" className="ca-panel__icon" title={t('common.close')} onClick={close}>{Icons.close}</button>
        </div>
        <div className="ca-history__list">
          {versions?.length === 0 && <div className="ca-side__empty">{t('historyDialog.noCanvasHistoryYet')}</div>}
          {versions?.map((v) => (
            <div key={v.file} className="ca-history__row">
              <span className="ca-menu__grow">{ago(v.time)}</span>
              <span className="ca-menu__key">{t('historyDialog.elements', v.count)}</span>
              <button type="button" className="ca-panel__secondary" onClick={() => restore(v)}>{t('historyDialog.restore')}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
