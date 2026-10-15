import { atom, useValue } from 'tldraw'

import { Icons } from './icons'
import { t } from '../i18n'

export const shortcutsAtom = atom('shortcuts open', false)

const SECTIONS: [string, [string, string][]][] = [
  [t('shortcuts.tools'), [[t('dock.select'), 'V'], [t('shortcuts.hand'), t('shortcuts.hDragWithSpace')], [t('common.artboard'), 'F'], [t('common.rectangle'), 'R'], [t('dock.circle'), 'O'], [t('shortcuts.line'), 'L'], [t('dock.arrow'), 'Shift A'], [t('common.text'), 'T'], [t('dock.stickyNote'), 'N'], [t('common.draw'), 'D / P'], [t('shortcuts.commentHoverAnImageLocal'), 'C'], [t('dock.imageGeneration'), 'A'], [t('dock.videoGeneration'), 'S']]],
  [t('common.edit'), [[t('common.undo'), 'Ctrl Z'], [t('shortcuts.redo'), 'Ctrl Shift Z'], [t('common.copy'), 'Ctrl C'], [t('common.cut'), 'Ctrl X'], [t('canvasMenu.paste'), 'Ctrl V'], [t('common.duplicate'), 'Ctrl D'], [t('common.delete'), 'Delete'], [t('canvasMenu.selectAll'), 'Ctrl A'], [t('shortcuts.group'), 'Ctrl G'], [t('shortcuts.ungroup'), 'Ctrl Shift G']]],
  [t('shortcuts.view'), [[t('common.upscale'), 'Ctrl +'], [t('common.zoomOut'), 'Ctrl -'], [t('shortcuts.zoomTo100'), 'Shift 0'], [t('shortcuts.fitCanvas'), 'Shift 1'], [t('shortcuts.fitSelection'), 'Shift 2']]],
  [t('common.layers'), [[t('shortcuts.bringToFront'), ']'], [t('shortcuts.sendToBack'), '['], [t('canvasMenu.bringForward'), 'Ctrl ]'], [t('canvasMenu.sendBackward'), 'Ctrl ['], [t('canvasMenu.lockUnlock'), 'Shift L'], [t('common.flipHorizontal'), 'Shift H'], [t('common.flipVertical'), 'Shift V'], [t('shortcuts.nudge'), t('shortcuts.arrowKeys')], [t('shortcuts.nudge10px'), t('shortcuts.shiftArrowKeys')]]],
  [t('common.image'), [[t('common.quickEdit'), 'Tab']]],
]

export function Shortcuts() {
  const open = useValue(shortcutsAtom)
  if (!open) return null
  return (
    <div className="ca-modal" onPointerDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) shortcutsAtom.set(false) }}>
      <div className="ca-modal__card">
        <div className="ca-side__head">
          <span>{t('shortcuts.keyboardShortcuts')}</span>
          <button type="button" className="ca-panel__icon" title={t('common.close')} onClick={() => shortcutsAtom.set(false)}>{Icons.close}</button>
        </div>
        <div className="ca-keys">
          {SECTIONS.map(([title, rows]) => (
            <section key={title}>
              <div className="ca-gen__label">{title}</div>
              {rows.map(([label, key]) => (
                <div key={label} className="ca-keys__row"><span>{label}</span><kbd>{key}</kbd></div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
