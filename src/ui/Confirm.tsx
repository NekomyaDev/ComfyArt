import { atom, useValue } from 'tldraw'

import { Icons } from './icons'
import { t } from '../i18n'

interface Ask { title: string; desc: string; ok: string; run: () => void }

export const confirmAtom = atom<Ask | null>('confirm', null)

export function Confirm() {
  const ask = useValue(confirmAtom)
  if (!ask) return null
  const close = () => confirmAtom.set(null)
  return (
    <div className="ca-modal" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) close() }}>
      <div className="ca-modal__card ca-rename">
        <div className="ca-side__head">
          <span>{ask.title}</span>
          <button type="button" className="ca-panel__icon" title={t('common.close')} onClick={close}>{Icons.close}</button>
        </div>
        <div className="ca-rename__body">
          <div>{ask.desc}</div>
          <div className="ca-panel__foot">
            <button type="button" className="ca-panel__secondary" onClick={close}>{t('common.cancel')}</button>
            <button type="button" className="ca-panel__primary ca-panel__danger" onClick={() => { close(); ask.run() }}>{ask.ok}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
