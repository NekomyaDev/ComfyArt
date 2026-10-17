import {
  atom,
  BaseBoxShapeUtil,
  createShapeId,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  HTMLContainer,
  StateNode,
  T,
  type RecordProps,
  type TLShape,
  type TLShapeId,
} from 'tldraw'

export const VECTOR = 'ca-shape'
export type VectorKind = 'rect' | 'ellipse' | 'polygon' | 'star'

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [VECTOR]: {
      w: number
      h: number
      kind: string
      fill: string
      radius: number
      sides: number
      fillType: string
      fill2: string
      angle: number
      stroke: string
      strokeWidth: number
      strokeAlign: string
      dash: string
    }
  }
}

export type VectorShape = TLShape<typeof VECTOR>

const versions = createShapePropsMigrationIds(VECTOR, { AddStrokeGradient: 1 })

export const vectorKindAtom = atom<VectorKind>('vector kind', 'rect')

const CLICK_W = 320
const RECT_H = 200
const MIN_DRAG = 4

function points(kind: string, w: number, h: number, sides: number): string {
  const n = kind === 'star' ? sides * 2 : sides
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    const r = kind === 'star' && i % 2 ? 0.45 : 1
    return `${w / 2 + (Math.cos(a) * r * w) / 2},${h / 2 + (Math.sin(a) * r * h) / 2}`
  }).join(' ')
}

export class VectorShapeUtil extends BaseBoxShapeUtil<VectorShape> {
  static override type = VECTOR
  static override props: RecordProps<VectorShape> = {
    w: T.number,
    h: T.number,
    kind: T.string,
    fill: T.string,
    radius: T.number,
    sides: T.number,
    fillType: T.string,
    fill2: T.string,
    angle: T.number,
    stroke: T.string,
    strokeWidth: T.number,
    strokeAlign: T.string,
    dash: T.string,
  }

  static override migrations = createShapePropsMigrationSequence({
    sequence: [{
      id: versions.AddStrokeGradient,
      up: (props) => Object.assign(props, { fillType: 'solid', fill2: '#FFFFFF', angle: 90, stroke: '', strokeWidth: 4, strokeAlign: 'center', dash: 'solid' }),
    }],
  })

  override getDefaultProps(): VectorShape['props'] {
    return {
      w: CLICK_W, h: RECT_H, kind: 'rect', fill: '#CCCCCC', radius: 0, sides: 5,
      fillType: 'solid', fill2: '#FFFFFF', angle: 90, stroke: '#333333', strokeWidth: 2, strokeAlign: 'center', dash: 'solid',
    }
  }

  override canEdit() {
    return false
  }

  override component(shape: VectorShape) {
    const { w, h, kind, fill, radius, sides, fillType, fill2, angle, stroke, strokeWidth, strokeAlign, dash } = shape.props
    const gid = `g-${shape.id.replace(/\W/g, '')}`
    const cid = `c-${shape.id.replace(/\W/g, '')}`
    const paint = fillType === 'solid' ? fill : `url(#${gid})`
    const sw = stroke ? strokeWidth * (strokeAlign === 'center' ? 1 : 2) : 0
    const dashArray = dash === 'dashed' ? `${strokeWidth * 3} ${strokeWidth * 2}` : dash === 'dotted' ? `0 ${strokeWidth * 2}` : undefined
    const outline = kind === 'rect'
      ? <rect width={w} height={h} rx={Math.min(radius, w / 2, h / 2)} />
      : kind === 'ellipse'
        ? <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} />
        : <polygon points={points(kind, w, h, sides)} />
    const rad = (angle * Math.PI) / 180
    return (
      <HTMLContainer style={{ pointerEvents: 'none' }}>
        <svg width={w} height={h} style={{ overflow: 'visible', display: 'block' }}>
          <defs>
            {fillType === 'linear' && (
              <linearGradient id={gid} x1={0.5 - Math.cos(rad) / 2} y1={0.5 - Math.sin(rad) / 2} x2={0.5 + Math.cos(rad) / 2} y2={0.5 + Math.sin(rad) / 2}>
                <stop offset="0" stopColor={fill} /><stop offset="1" stopColor={fill2} />
              </linearGradient>
            )}
            {fillType === 'radial' && (
              <radialGradient id={gid}><stop offset="0" stopColor={fill} /><stop offset="1" stopColor={fill2} /></radialGradient>
            )}
            {strokeAlign === 'inside' && <clipPath id={cid}>{outline}</clipPath>}
          </defs>
          {strokeAlign !== 'outside' && <g fill={paint}>{outline}</g>}
          {stroke && (
            <g
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={dashArray}
              strokeLinecap={dash === 'dotted' ? 'round' : undefined}
              clipPath={strokeAlign === 'inside' ? `url(#${cid})` : undefined}
            >
              {outline}
            </g>
          )}
          {strokeAlign === 'outside' && <g fill={paint}>{outline}</g>}
        </svg>
      </HTMLContainer>
    )
  }

  override getIndicatorPath(shape: VectorShape) {
    const path = new Path2D()
    path.rect(0, 0, shape.props.w, shape.props.h)
    return path
  }
}

export class VectorTool extends StateNode {
  static override id = VECTOR
  private draft: { id: TLShapeId; x: number; y: number } | null = null

  override onEnter() {
    this.editor.setCursor({ type: 'cross', rotation: 0 })
  }

  override onCancel() {
    this.editor.setCurrentTool('select')
  }

  override onPointerDown() {
    const p = this.editor.inputs.getCurrentPagePoint()
    const id = createShapeId()
    this.editor.createShape<VectorShape>({ id, type: VECTOR, x: p.x, y: p.y, props: { kind: vectorKindAtom.get(), w: 1, h: 1 } })
    this.draft = { id, x: p.x, y: p.y }
  }

  override onPointerMove() {
    if (!this.draft || !this.editor.inputs.getIsDragging()) return
    this.track()
  }

  override onPointerUp() {
    const editor = this.editor
    if (!this.draft) return
    this.track()
    const shape = editor.getShape<VectorShape>(this.draft.id)
    if (shape && Math.max(shape.props.w, shape.props.h) < MIN_DRAG) {
      const h = shape.props.kind === 'rect' ? RECT_H : CLICK_W
      editor.updateShape<VectorShape>({ id: shape.id, type: VECTOR, x: this.draft.x - CLICK_W / 2, y: this.draft.y - h / 2, props: { w: CLICK_W, h } })
    }
    const id = this.draft.id
    this.draft = null
    editor.setCurrentTool('select')
    editor.select(id)
  }

  private track() {
    const { id, x, y } = this.draft!
    const p = this.editor.inputs.getCurrentPagePoint()
    let [w, h] = [Math.abs(p.x - x), Math.abs(p.y - y)]
    if (this.editor.inputs.getShiftKey()) w = h = Math.max(w, h)
    this.editor.updateShape<VectorShape>({
      id,
      type: VECTOR,
      x: p.x < x ? x - w : x,
      y: p.y < y ? y - h : y,
      props: { w: Math.max(w, 1), h: Math.max(h, 1) },
    })
  }
}
