import { AssetRecordType, type Editor, type TLImageShape } from 'tldraw'

import { uploadImage, viewUrl } from './comfy'

function assetOf(editor: Editor, shape: TLImageShape) {
  const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : null
  return asset?.type === 'image' && asset.props.src ? asset : null
}

export function originalOf(shape: TLImageShape): string | null {
  return (shape.meta.original as string | undefined) ?? null
}

function setSource(editor: Editor, shape: TLImageShape, src: string, w: number, h: number, name: string, original: string | null) {
  const assetId = AssetRecordType.createId()
  editor.createAssets([{ id: assetId, typeName: 'asset', type: 'image', props: { name, src, w, h, mimeType: 'image/png', isAnimated: false }, meta: {} }])
  editor.updateShape<TLImageShape>({ id: shape.id, type: 'image', props: { assetId, crop: null }, meta: { ...shape.meta, original } })
}

export async function replacePixels(editor: Editor, shape: TLImageShape, canvas: HTMLCanvasElement) {
  const asset = assetOf(editor, shape)
  if (!asset) return
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('export failed')
  const ref = await uploadImage(blob, `${asset.props.name || 'image'}.png`.replace(/(\.png)+$/, '.png'))
  const current = editor.getShape<TLImageShape>(shape.id) ?? shape
  setSource(editor, current, viewUrl(ref), canvas.width, canvas.height, asset.props.name, originalOf(current) ?? asset.props.src)
}

export function restoreOriginal(editor: Editor, shape: TLImageShape) {
  const src = originalOf(shape)
  const asset = assetOf(editor, shape)
  if (!src || !asset) return
  const img = new Image()
  img.onload = () => setSource(editor, shape, src, img.naturalWidth, img.naturalHeight, asset.props.name, null)
  img.src = src
}
