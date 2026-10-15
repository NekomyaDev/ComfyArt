import { useState } from 'react'
import { atom, useValue, type Editor, type TLShape, type TLShapeId } from 'tldraw'

import { mediaAsset } from '../jobs'
import { GENERATOR } from '../shapes/GeneratorShape'
import { isVideo } from '../models'
import { CommentsList } from './CommentsList'
import { Icons } from './icons'
import { LibraryPanel } from './LibraryPanel'
import { ReferencePanel } from './ReferencePanel'
import { t } from '../i18n'

export type Side = 'layers' | 'files' | 'assets' | 'comments' | 'references'
export const sideAtom = atom<Side | null>('side panel', null)
const TITLES: Record<Side, string> = { layers: t('common.layers'), files: t('canvasTools.generatedFiles'), assets: t('sidePanel.myAssets'), comments: t('common.allComments'), references: t('common.reference') }

const TYPE_NAMES: Record<string, string> = { image: t('common.image'), video: t('common.video'), frame: t('common.artboard'), group: t('shortcuts.group'), draw: t('common.draw'), doodle: t('common.draw'), comment: t('common.comment'), text: t('common.text'), 'ca-text': t('common.text') }

interface Media { src: string; name: string; video: boolean }

function mediaOf(editor: Editor, shape: TLShape): Media | null {
  const asset = mediaAsset(editor, shape)
  if (!asset) return null
  return { src: asset.props.src, name: asset.props.name, video: asset.type === 'video' }
}

const VECTOR_NAMES: Record<string, string> = { rect: t('common.rectangle'), ellipse: t('sidePanel.ellipse'), polygon: t('dock.polygon'), star: t('dock.star') }

function typeName(shape: TLShape) {
  if (shape.type === 'ca-shape') return VECTOR_NAMES[(shape.props as { kind: string }).kind] ?? t('sidePanel.shape')
  if (shape.type === GENERATOR) return isVideo((shape.props as { workflow: string }).workflow) ? t('selectionLabel.videoGenerator') : t('selectionLabel.imageGenerator')
  return TYPE_NAMES[shape.type] ?? t('sidePanel.shape')
}

function generated(editor: Editor): (Media & { id: TLShapeId })[] {
  return editor.store.query.records('shape').get().flatMap((s) => {
    const m = mediaOf(editor, s)
    return m && m.src.includes('type=output') ? [{ ...m, id: s.id }] : []
  }).reverse()
}

function reveal(editor: Editor, id: TLShapeId) {
  const page = editor.getAncestorPageId(id)
  if (page) editor.setCurrentPage(page)
  editor.select(id)
  editor.zoomToSelection({ animation: { duration: 200 } })
}

function Preview({ m }: { m: Media }) {
  return m.video ? <video src={m.src} muted preload="metadata" /> : <img src={m.src} alt="" />
}

function Row({ editor, id, depth, names }: { editor: Editor; id: TLShapeId; depth: number; names: Map<TLShapeId, string> }) {
  const shape = useValue('layer', () => editor.getShape(id), [editor, id])
  const selected = useValue('layer selected', () => editor.getSelectedShapeIds().includes(id), [editor, id])
  const children = useValue('layer children', () => [...editor.getSortedChildIdsForParent(id)].reverse(), [editor, id])
  if (!shape) return null
  const media = mediaOf(editor, shape)
  const hidden = !!shape.meta.hidden
  const pick = (e: React.MouseEvent) => {
    if (e.shiftKey) editor.select(...editor.getSelectedShapeIds(), id)
    else editor.select(id)
    editor.zoomToSelectionIfOffscreen(64, { animation: { duration: 200 } })
  }
  const flag = (patch: Partial<TLShape>) => (e: React.MouseEvent) => {
    e.stopPropagation()
    editor.run(() => editor.updateShape({ id, type: shape.type, ...patch } as TLShape), { ignoreShapeLock: true })
  }
  return (
    <>
      <div className="ca-layer" data-on={selected || undefined} data-off={hidden || undefined} style={{ paddingLeft: 12 + depth * 16 }} onClick={pick}>
        <span className="ca-layer__thumb">{media ? <Preview m={media} /> : <span className="ca-icon">{shape.type === GENERATOR ? Icons.genImage : Icons.layers}</span>}</span>
        <span className="ca-layer__name">{names.get(id)}</span>
        <button type="button" className="ca-layer__act" data-keep={shape.isLocked || undefined} title={shape.isLocked ? t('sidePanel.unlock') : t('sidePanel.lock')} onClick={flag({ isLocked: !shape.isLocked })}>
          <span className="ca-icon">{shape.isLocked ? Icons.lock : Icons.unlock}</span>
        </button>
        <button type="button" className="ca-layer__act" data-keep={hidden || undefined} title={hidden ? t('sidePanel.show') : t('sidePanel.hide')} onClick={flag({ meta: { ...shape.meta, hidden: !hidden } })}>
          <span className="ca-icon">{hidden ? Icons.eyeOff : Icons.eye}</span>
        </button>
      </div>
      {children.map((c) => <Row key={c} editor={editor} id={c} depth={depth + 1} names={names} />)}
    </>
  )
}

function Layers({ editor }: { editor: Editor }) {
  const [history, setHistory] = useState(true)
  const top = useValue('layer roots', () => [...editor.getSortedChildIdsForParent(editor.getCurrentPageId())].reverse(), [editor])
  const items = useValue('history', () => generated(editor), [editor])
  const names = useValue('layer names', () => {
    const count: Record<string, number> = {}
    const out = new Map<TLShapeId, string>()
    for (const s of editor.getCurrentPageShapesSorted()) {
      const base = typeName(s)
      count[base] = (count[base] ?? 0) + 1
      out.set(s.id, (s.meta.name as string | undefined) || (s.type === 'frame' && (s.props as { name: string }).name) || mediaOf(editor, s)?.name || `${base} ${count[base]}`)
    }
    return out
  }, [editor])
  return (
    <>
      <button type="button" className="ca-side__section" onClick={() => setHistory(!history)}>
        <span>{t('sidePanel.history')}</span><span className="ca-icon" data-flip={history || undefined}>{Icons.chevron}</span>
      </button>
      {history && (items.length
        ? <div className="ca-side__grid">{items.map((m) => <button key={m.id} type="button" className="ca-side__cell" onClick={() => reveal(editor, m.id)}><Preview m={m} /></button>)}</div>
        : <div className="ca-side__empty">{t('sidePanel.noHistoryYet')}</div>)}
      <div className="ca-side__rule" />
      {top.map((id) => <Row key={id} editor={editor} id={id} depth={0} names={names} />)}
    </>
  )
}

function Files({ editor }: { editor: Editor }) {
  const items = useValue('files', () => generated(editor), [editor])
  if (!items.length) return <div className="ca-side__empty">{t('sidePanel.noFilesYet')}</div>
  return (
    <>
      {items.map((m) => (
        <div key={m.id} className="ca-file">
          <span className="ca-file__thumb"><Preview m={m} /></span>
          <span className="ca-file__name">{new URL(m.src, location.origin).searchParams.get('filename')}</span>
          <a className="ca-bar__btn ca-bar__btn--icon" href={m.src} download={m.name} title={t('common.download')}><span className="ca-icon">{Icons.download}</span></a>
        </div>
      ))}
      <div className="ca-side__empty">{t('sidePanel.noMoreItems')}</div>
    </>
  )
}

export function SidePanel({ editor, onError }: { editor: Editor; onError: (msg: string) => void }) {
  const side = useValue(sideAtom)
  if (!side) return null
  const onClose = () => sideAtom.set(null)
  return (
    <div className="ca-side" onPointerDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <div className="ca-side__head">
        <span>{TITLES[side]}</span>
        <button type="button" className="ca-panel__icon" title={t('common.close')} onClick={onClose}>{Icons.close}</button>
      </div>
      <div className="ca-side__body">
        {side === 'layers' && <Layers editor={editor} />}
        {side === 'files' && <Files editor={editor} />}
        {side === 'assets' && <LibraryPanel editor={editor} onError={onError} />}
        {side === 'comments' && <CommentsList editor={editor} onError={onError} />}
        {side === 'references' && <ReferencePanel editor={editor} onError={onError} />}
      </div>
    </div>
  )
}
