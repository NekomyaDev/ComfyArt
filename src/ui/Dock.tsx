import { useEffect, useRef, useState } from 'react'
import { Box, createShapeId, useEditor, useValue } from 'tldraw'

import { createGenerator } from '../generate'
import { imageUnder } from '../actions'
import { COMMENT, COMMENT_SIZE, commentKindAtom, type CommentKind } from '../shapes/CommentShape'
import { DOODLE } from '../shapes/DoodleShape'
import { TEXT } from '../shapes/TextShape'
import { VECTOR, vectorKindAtom } from '../shapes/VectorShape'
import { DoodleBar } from './DoodleBar'
import { NativeStyleBar } from './NativeStyleBar'
import { Icons } from './icons'
import { Popover } from './Popover'
import { shortcutsAtom } from './Shortcuts'
import { t } from '../i18n'

const INSERTS: [string, string, keyof typeof Icons, string, string?][] = [
  ['text', t('common.text'), 'textTool', 'T'], ['rect', t('common.rectangle'), 'rect', 'R'], ['ellipse', t('dock.circle'), 'ellipse', 'O'], ['polygon', t('dock.polygon'), 'polygon', ''], ['star', t('dock.star'), 'star', ''],
  ['line', t('dock.line'), 'minus', 'L'], ['arrow', t('dock.arrow'), 'link', 'Shift A'], ['note', t('dock.stickyNote'), 'page', 'N'], ['frame', t('common.artboard'), 'frame', 'F'],
]

const KINDS: [CommentKind, string, keyof typeof Icons][] = [['point', t('dock.clickSelect'), 'comment'], ['lasso', t('dock.lassoSelect'), 'lasso'], ['box', t('dock.boxSelect'), 'box']]

function CommentBar() {
  const kind = useValue(commentKindAtom)
  return (
    <div className="ca-bar">
      {KINDS.map(([k, label, icon]) => (
        <button key={k} type="button" className="ca-bar__btn ca-bar__btn--icon" title={label} data-on={kind === k || undefined} onClick={() => commentKindAtom.set(k)}>
          <span className="ca-icon">{Icons[icon]}</span>
        </button>
      ))}
    </div>
  )
}

export function Dock() {
  const editor = useEditor()
  const tool = useValue('tool', () => editor.getCurrentToolId(), [editor])
  const [video, setVideo] = useState(false)
  const [menu, setMenu] = useState(false)
  const [insert, setInsert] = useState(false)
  const upload = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const keys: Record<string, () => void> = {
      a: () => { setVideo(false); createGenerator(editor) },
      s: () => { setVideo(true); createGenerator(editor, true) },
      c: () => {
        const p = editor.inputs.getCurrentPagePoint()
        if (editor.getCurrentToolId() !== 'select' || !imageUnder(editor, new Box(p.x, p.y, 1, 1))) return editor.setCurrentTool(COMMENT)
        const id = createShapeId()
        editor.createShape({ id, type: COMMENT, x: p.x - COMMENT_SIZE / 2, y: p.y - COMMENT_SIZE / 2 })
        editor.select(id)
      },
      d: () => editor.setCurrentTool(DOODLE),
      p: () => editor.setCurrentTool(DOODLE),
      t: () => editor.setCurrentTool(TEXT),
      r: () => { vectorKindAtom.set('rect'); editor.setCurrentTool(VECTOR) },
      o: () => { vectorKindAtom.set('ellipse'); editor.setCurrentTool(VECTOR) },
      l: () => editor.setCurrentTool('line'),
      n: () => editor.setCurrentTool('note'),
      'shift+a': () => editor.setCurrentTool('arrow'),
      'shift+?': () => shortcutsAtom.set(true),
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (editor.getEditingShapeId()) return
      const fn = keys[`${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`]
      if (!fn) return
      e.preventDefault()
      e.stopPropagation()
      fn()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [editor])

  const gen = (v: boolean) => () => { setMenu(false); setVideo(v); createGenerator(editor, v) }
  const pickTool = (id: string) => {
    setInsert(false)
    if (id === 'text') editor.setCurrentTool(TEXT)
    else if (id === 'rect' || id === 'ellipse' || id === 'polygon' || id === 'star') { vectorKindAtom.set(id); editor.setCurrentTool(VECTOR) }
    else editor.setCurrentTool(id)
  }
  const inserting = tool === TEXT || tool === VECTOR || ['line', 'arrow', 'note', 'frame'].includes(tool)

  return (
    <div className="ca-dock" onPointerDown={(e) => e.stopPropagation()}>
      {tool === COMMENT ? <CommentBar /> : <><DoodleBar /><NativeStyleBar /></>}
      <div className="ca-bar">
        <button type="button" className="ca-bar__btn" data-on={tool === 'select' || undefined} title={t('dock.selectV')} onClick={() => editor.setCurrentTool('select')}>
          <span className="ca-icon">{Icons.select}</span><span>{t('dock.select')}</span>
        </button>
        <button type="button" className="ca-bar__btn" data-on={tool === COMMENT || undefined} title={t('dock.commentC')} onClick={() => editor.setCurrentTool(COMMENT)}>
          <span className="ca-icon">{Icons.comment}</span><span>{t('common.comment')}</span>
        </button>
        <button type="button" className="ca-bar__btn" data-on={tool === DOODLE || undefined} title={t('dock.drawD')} onClick={() => editor.setCurrentTool(DOODLE)}>
          <span className="ca-icon">{Icons.doodle}</span><span>{t('common.draw')}</span>
        </button>
        <Popover
          open={insert}
          onOpenChange={setInsert}
          side="top"
          trigger={({ open, toggle }) => (
            <button type="button" className="ca-bar__btn" data-on={inserting || undefined} data-open={open || undefined} title={t('dock.insert')} onClick={toggle}>
              <span className="ca-icon">{Icons.plus}</span><span>{t('dock.insert')}</span>
            </button>
          )}
        >
          <div className="ca-menu">
            <button type="button" className="ca-menu__item" onClick={() => { setInsert(false); upload.current?.click() }}>
              <span className="ca-icon">{Icons.upload}</span><span className="ca-menu__grow">{t('common.uploadFile')}</span><span className="ca-menu__key">{t('dock.imageVideoPdf3dLottie')}</span>
            </button>
            <div className="ca-menu__sep" />
            {INSERTS.map(([id, label, icon, key]) => (
              <button key={id} type="button" className="ca-menu__item" onClick={() => pickTool(id)}>
                <span className="ca-icon">{Icons[icon]}</span><span className="ca-menu__grow">{label}</span>{key && <span className="ca-menu__key">{key}</span>}
              </button>
            ))}
          </div>
        </Popover>
        <input
          ref={upload}
          type="file"
          multiple
          hidden
          accept="image/*,video/*,.pdf,.json,.lottie,.html,.htm,.glb,.gltf,.obj,.fbx,.stl,.ply"
          onChange={(e) => { const files = Array.from(e.target.files ?? []); if (files.length) void editor.putExternalContent({ type: 'files', files, point: editor.getViewportPageBounds().center }); e.target.value = '' }}
        />
        <div className="ca-bar__sep" />
        <div className="ca-split">
          <button type="button" className="ca-bar__btn" onClick={gen(video)}>
            <span className="ca-icon">{video ? Icons.genVideo : Icons.genImage}</span><span>{video ? t('dock.videoGeneration') : t('dock.imageGeneration')}</span>
          </button>
          <Popover
            open={menu}
            onOpenChange={setMenu}
            side="top"
            align="end"
            trigger={({ open, toggle }) => (
              <button type="button" className="ca-bar__btn ca-split__chev" data-open={open || undefined} onClick={toggle}>
                <span className="ca-icon">{Icons.chevron}</span>
              </button>
            )}
          >
            <div className="ca-menu">
              <button type="button" className="ca-menu__item" onClick={gen(false)}>
                <span className="ca-icon">{Icons.genImage}</span><span className="ca-menu__grow">{t('dock.imageGeneration')}</span><span className="ca-menu__key">A</span>
              </button>
              <button type="button" className="ca-menu__item" onClick={gen(true)}>
                <span className="ca-icon">{Icons.genVideo}</span><span className="ca-menu__grow">{t('dock.videoGeneration')}</span><span className="ca-menu__key">S</span>
              </button>
            </div>
          </Popover>
        </div>
      </div>
    </div>
  )
}
