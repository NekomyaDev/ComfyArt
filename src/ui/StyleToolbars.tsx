import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useEditor, useValue, type TLShapeId } from 'tldraw'

import { brandFonts } from '../library'
import { download } from '../psd'
import { TEXT, type TextShape } from '../shapes/TextShape'
import { VECTOR, type VectorShape } from '../shapes/VectorShape'
import { ColorPicker } from './ColorPicker'
import { Icons } from './icons'
import { Popover } from './Popover'
import { useOnlySelected, useSelectionRect } from './selection'
import { t } from '../i18n'

const GAP = 22
const EDGE = 8
const FONTS = ['Arial', 'Helvetica', 'Inter', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Microsoft YaHei', 'PingFang SC', 'SimHei', 'SimSun', 'KaiTi', 'FangSong']
const WEIGHTS: [number, string][] = [[100, 'Thin'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'], [600, 'SemiBold'], [700, 'Bold'], [900, 'Black']]
const SIZES = [12, 14, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 200]
const SIZE_NAMES: Record<number, string> = { 12: t('styleToolbars.small'), 16: t('common.default'), 20: t('styleToolbars.regular'), 32: t('styleToolbars.large'), 48: t('styleToolbars.xLarge'), 64: t('styleToolbars.xxLarge'), 96: t('styleToolbars.huge') }
const ALIGNS: [string, keyof typeof Icons][] = [['left', 'alignLeft'], ['center', 'alignCenterH'], ['right', 'alignRight']]
const DECORATIONS: [string, string][] = [['none', t('common.none')], ['underline', t('styleToolbars.underline')], ['line-through', t('styleToolbars.strikethrough')]]
const CASES: [string, string][] = [['none', t('styleToolbars.asTyped')], ['uppercase', t('styleToolbars.uppercase')], ['lowercase', t('styleToolbars.lowercase')], ['capitalize', t('styleToolbars.capitalize')]]
const FILLS: [string, string][] = [['solid', t('styleToolbars.solid')], ['linear', t('styleToolbars.linear')], ['radial', t('styleToolbars.radial')]]
const STROKE_ALIGNS: [string, string][] = [['inside', t('styleToolbars.inside')], ['center', t('styleToolbars.center')], ['outside', t('styleToolbars.outside')]]
const DASHES: [string, string][] = [['solid', t('nativeStyleBar.solid')], ['dashed', t('nativeStyleBar.dashed')], ['dotted', t('nativeStyleBar.dotted')]]

function Chips({ value, options, onPick }: { value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <div className="ca-panel__chips">
      {options.map(([v, label]) => <button key={v} type="button" className="ca-panel__chip" data-on={value === v || undefined} onClick={() => onPick(v)}>{label}</button>)}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={({ open: o, toggle }) => (
        <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={title} data-open={o || undefined} onClick={toggle}>{icon}</button>
      )}
    >
      <div className="ca-menu ca-bg ca-style">{children}</div>
    </Popover>
  )
}

function useBar(rect: ReturnType<typeof useSelectionRect>) {
  const editor = useEditor()
  const bar = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (bar.current && bar.current.offsetWidth !== width) setWidth(bar.current.offsetWidth)
  })
  if (!rect) return { bar, style: {} }
  const host = editor.getContainer().getBoundingClientRect()
  const left = Math.min(Math.max((rect.l + rect.r) / 2 - width / 2, EDGE), host.width - width - EDGE)
  let top = rect.t - GAP - 44
  if (top < EDGE) top = rect.b + GAP
  return { bar, style: { left, top } }
}

function Pick<T extends string | number>({ value, options, label, onPick, width }: { value: T; options: [T, string][]; label: ReactNode; onPick: (v: T) => void; width?: number }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={({ open: o, toggle }) => (
        <button type="button" className="ca-bar__btn ca-pick" style={{ minWidth: width }} data-open={o || undefined} onClick={toggle}>
          <span className="ca-menu__grow">{label}</span><span className="ca-icon ca-pick__chev">{Icons.chevron}</span>
        </button>
      )}
    >
      <div className="ca-menu ca-pick__menu">
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" className="ca-menu__item" onClick={() => { setOpen(false); onPick(v) }}>
            <span className="ca-menu__grow">{text}</span>{v === value && <span className="ca-icon">{Icons.check}</span>}
          </button>
        ))}
      </div>
    </Popover>
  )
}

function Num({ value, label, onChange, min = 0 }: { value: number; label: string; onChange: (v: number) => void; min?: number }) {
  return (
    <label className="ca-num">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        value={Math.round(value)}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= min) onChange(v) }}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </label>
  )
}

async function downloadShape(editor: ReturnType<typeof useEditor>, id: TLShapeId, name: string) {
  const { blob } = await editor.toImage([id], { format: 'png', scale: 2, background: false })
  download(blob, `${name}.png`)
}

function useFonts() {
  const brand = useValue('brand fonts', brandFonts, [])
  const [local, setLocal] = useState<string[]>([])
  const fonts = [...new Set([...brand, ...FONTS, ...local])]
  const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
  const loadLocal = query ? async () => {
    setLocal((await query()).map((f) => f.family))
  } : null
  return { fonts, loadLocal }
}

export function TextToolbar({ onError }: { onError: (msg: string) => void }) {
  const editor = useEditor()
  const shape = useOnlySelected<TextShape>(TEXT)
  const rect = useSelectionRect()
  const { bar, style } = useBar(rect)
  const { fonts, loadLocal } = useFonts()
  const [more, setMore] = useState(false)
  const editing = useValue('text editing', () => !!shape && editor.getEditingShapeId() === shape.id, [editor, shape?.id])
  if (!shape || !rect || editing) return null
  const p = shape.props
  const set = (patch: Partial<TextShape['props']>) => editor.updateShape<TextShape>({ id: shape.id, type: TEXT, props: patch })

  return (
    <div ref={bar} className="ca-bar ca-toolbar" style={style} onPointerDown={(e) => e.stopPropagation()}>
      <ColorPicker value={p.color} title={t('styleToolbars.textColor')} onChange={(c) => c && set({ color: c })} />
      <ColorPicker
        value={p.stroke}
        title={t('styleToolbars.stroke')}
        allowNone
        onChange={(c) => set({ stroke: c })}
        trigger={({ open, toggle }) => (
          <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('styleToolbars.stroke')} data-open={open || undefined} onClick={toggle}>
            <span className="ca-tools__ring" style={{ borderColor: p.stroke || 'var(--ca-muted)' }} />
          </button>
        )}
      />
      <div className="ca-bar__sep" />
      <Pick
        value={p.font}
        width={130}
        label={<span style={{ fontFamily: p.font }}>{p.font}</span>}
        options={[...fonts.map((f) => [f, f] as [string, string]), ...(loadLocal ? [['__local', t('styleToolbars.loadLocalFonts')] as [string, string]] : [])]}
        onPick={(f) => (f === '__local' ? loadLocal?.().catch((e) => onError(String(e))) : set({ font: f }))}
      />
      <Pick value={p.weight} width={100} label={WEIGHTS.find(([w]) => w === p.weight)?.[1] ?? p.weight} options={WEIGHTS} onPick={(w) => set({ weight: w })} />
      <Pick value={p.size} width={64} label={p.size} options={SIZES.map((s) => [s, SIZE_NAMES[s] ? `${s} · ${SIZE_NAMES[s]}` : String(s)])} onPick={(s) => set({ size: s })} />
      <div className="ca-bar__sep" />
      <Pick value={p.align} label={<span className="ca-icon">{Icons[ALIGNS.find(([a]) => a === p.align)?.[1] ?? 'alignLeft']}</span>} options={ALIGNS.map(([a]) => [a, { left: t('multiToolbar.alignLeft'), center: t('styleToolbars.center'), right: t('multiToolbar.alignRight') }[a]!] as [string, string])} onPick={(a) => set({ align: a })} />
      <Popover
        open={more}
        onOpenChange={setMore}
        trigger={({ open, toggle }) => (
          <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('styleToolbars.textSettings')} data-open={open || undefined} onClick={toggle}><span className="ca-icon">{Icons.spacing}</span></button>
        )}
      >
        <div className="ca-menu ca-bg ca-style">
          <div className="ca-gen__label">{t('styleToolbars.decoration')}</div>
          <Chips value={p.decoration} options={DECORATIONS} onPick={(v) => set({ decoration: v })} />
          <div className="ca-gen__label">{t('styleToolbars.case')}</div>
          <Chips value={p.transform} options={CASES} onPick={(v) => set({ transform: v })} />
          <Num label={t('styleToolbars.letterSpacing')} value={p.letter} min={-20} onChange={(v) => set({ letter: v })} />
          <label className="ca-num"><span>{t('styleToolbars.lineHeight')}</span>
            <input type="number" step={0.1} min={0.5} value={p.line} onChange={(e) => { const v = Number(e.target.value); if (v >= 0.5) set({ line: v }) }} onKeyDown={(e) => e.stopPropagation()} />
          </label>
        </div>
      </Popover>
      <div className="ca-bar__sep" />
      <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('common.download')} onClick={() => void downloadShape(editor, shape.id, p.text.slice(0, 20) || 'text')}>
        <span className="ca-icon">{Icons.download}</span>
      </button>
    </div>
  )
}

export function ShapeToolbar() {
  const editor = useEditor()
  const shape = useOnlySelected<VectorShape>(VECTOR)
  const rect = useSelectionRect()
  const { bar, style } = useBar(rect)
  const [lock, setLock] = useState(false)
  if (!shape || !rect) return null
  const p = shape.props
  const set = (patch: Partial<VectorShape['props']>) => editor.updateShape<VectorShape>({ id: shape.id, type: VECTOR, props: patch })
  const size = (key: 'w' | 'h', v: number) => {
    if (v < 1) return
    if (!lock) return set({ [key]: v })
    const k = v / p[key]
    set({ w: p.w * k, h: p.h * k })
  }

  return (
    <div ref={bar} className="ca-bar ca-toolbar" style={style} onPointerDown={(e) => e.stopPropagation()}>
      <Section title={t('styleToolbars.fill')} icon={<span className="ca-tools__dot" style={{ background: p.fillType === 'solid' ? p.fill : `linear-gradient(${p.angle + 90}deg, ${p.fill}, ${p.fill2})` }} />}>
        <Chips value={p.fillType} options={FILLS} onPick={(v) => set({ fillType: v })} />
        <div className="ca-style__row">
          <ColorPicker value={p.fill} title={p.fillType === 'solid' ? t('common.color') : t('styleToolbars.startColor')} onChange={(c) => c && set({ fill: c })} />
          {p.fillType !== 'solid' && <ColorPicker value={p.fill2} title={t('styleToolbars.endColor')} onChange={(c) => c && set({ fill2: c })} />}
          {p.fillType === 'linear' && <Num label={t('styleToolbars.angle')} value={p.angle} min={-360} onChange={(v) => set({ angle: v })} />}
        </div>
      </Section>
      <Section title={t('styleToolbars.stroke')} icon={<span className="ca-tools__ring" style={{ borderColor: p.stroke || 'var(--ca-muted)' }} />}>
        <div className="ca-style__row">
          <ColorPicker value={p.stroke} title={t('styleToolbars.strokeColor')} allowNone onChange={(c) => set({ stroke: c })} />
          <Num label={t('doodleBar.size')} value={p.strokeWidth} min={1} onChange={(v) => set({ strokeWidth: v })} />
        </div>
        <div className="ca-gen__label">{t('styleToolbars.position')}</div>
        <Chips value={p.strokeAlign} options={STROKE_ALIGNS} onPick={(v) => set({ strokeAlign: v })} />
        <div className="ca-gen__label">{t('styleToolbars.style')}</div>
        <Chips value={p.dash} options={DASHES} onPick={(v) => set({ dash: v })} />
      </Section>
      {p.kind === 'rect' && <Num label={t('styleToolbars.cornerRadius')} value={p.radius} onChange={(v) => set({ radius: v })} />}
      {(p.kind === 'polygon' || p.kind === 'star') && <Num label={p.kind === 'star' ? t('styleToolbars.points') : t('styleToolbars.sides')} value={p.sides} min={3} onChange={(v) => set({ sides: Math.min(v, 24) })} />}
      <div className="ca-bar__sep" />
      <Num label="W" value={p.w} min={1} onChange={(v) => size('w', v)} />
      <Num label="H" value={p.h} min={1} onChange={(v) => size('h', v)} />
      <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('styleToolbars.lockRatio')} data-on={lock || undefined} onClick={() => setLock(!lock)}>
        <span className="ca-icon">{Icons.link}</span>
      </button>
      <div className="ca-bar__sep" />
      <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('common.download')} onClick={() => void downloadShape(editor, shape.id, p.kind)}>
        <span className="ca-icon">{Icons.download}</span>
      </button>
    </div>
  )
}
