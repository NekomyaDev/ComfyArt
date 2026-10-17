import { useRef, useState } from 'react'
import { atom, useValue, type Editor } from 'tldraw'

import { kitsAtom } from '../agent'
import { placeAsset } from '../assets'
import { uploadImage, viewUrl } from '../comfy'
import { errorText } from '../jobs'
import { COLOR_ROLES, KIND_LABELS, libraryAtom, saveLibrary, type FontFile, type LibraryItem, type LibraryKind } from '../library'
import { openProject } from '../projects'
import { ask, parseJson } from '../llm'
import { isPdf, uploadPdf } from '../pdf'
import { AssetGrid } from './AssetPicker'
import { ColorPicker } from './ColorPicker'
import { confirmAtom } from './Confirm'
import { Icons } from './icons'
import { Popover } from './Popover'
import { t } from '../i18n'
import { uuid } from '../id'

type Tab = 'files' | LibraryKind
export const libraryTabAtom = atom<Tab>('library tab', 'files')
const TABS: [Tab, string][] = [['files', t('libraryPanel.files')], ['brand', t('library.brandKit')], ['character', t('library.character')], ['product', t('library.product')], ['custom', t('common.custom')]]

const BRAND_SYSTEM = t('libraryPanel.youReadBrandGuidelinesReply')

const GUIDE_PAGES = 6
const GUIDE_TEXT = 12000

async function extractBrand(srcs: string[], text: string): Promise<Partial<LibraryItem>> {
  const prompt = `Extract the brand identity from this brand guide (${srcs.length} page image(s) attached).${text.trim() ? `\n\nText of the guide:\n${text.slice(0, GUIDE_TEXT)}` : ''}`
  const json = parseJson(await ask(prompt, BRAND_SYSTEM, srcs))
  if (!json) throw new Error(t('libraryPanel.couldNotExtractBrandInfo'))
  const colors = ((json.colors as { hex?: string; role?: string }[] | undefined) ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex ?? ''))
  return {
    name: typeof json.name === 'string' ? json.name : undefined,
    colors: colors.map((c) => c.hex!.toUpperCase()),
    roles: colors.map((c) => (c.role && c.role in COLOR_ROLES ? c.role : '')),
    fonts: Array.isArray(json.fonts) ? json.fonts.map(String) : [],
    description: typeof json.guidelines === 'string' ? json.guidelines : '',
  }
}

function ItemEditor({ item, onDone, onError }: { item: LibraryItem; onDone: (item: LibraryItem | null) => void; onError: (msg: string) => void }) {
  const [draft, setDraft] = useState(item)
  const [pick, setPick] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const logoFile = useRef<HTMLInputElement>(null)
  const guide = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<LibraryItem>) => setDraft({ ...draft, ...patch })
  const uploaded = async (files: FileList | null) => {
    const srcs: string[] = []
    for (const f of Array.from(files ?? [])) srcs.push(viewUrl(await uploadImage(f, f.name)))
    return srcs
  }
  const upload = async (files: FileList | null) => {
    const srcs = await uploaded(files)
    setDraft((d) => ({ ...d, images: [...d.images, ...srcs] }))
  }
  const fromGuide = async (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const pages = isPdf(file) ? (await uploadPdf(file, GUIDE_PAGES)) : null
      const srcs = pages ? pages.map((p) => p.src) : await uploaded(files)
      const src = srcs[0]
      const found = await extractBrand(srcs, pages ? pages.map((p) => p.text).join('\n') : '')
      setDraft((d) => ({
        ...d,
        name: d.name || found.name || '',
        colors: [...d.colors, ...(found.colors ?? [])],
        roles: [...d.colors.map((_, i) => d.roles?.[i] ?? ''), ...(found.roles ?? [])],
        fonts: [...new Set([...d.fonts, ...(found.fonts ?? [])])],
        description: d.description || found.description || '',
        images: [...d.images, src],
      }))
    } finally {
      setBusy(false)
    }
  }
  const roles = draft.colors.map((_, i) => draft.roles?.[i] ?? '')
  const fontFile = useRef<HTMLInputElement>(null)
  const [local, setLocal] = useState<string[]>([])
  const localFonts = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
  const pickLocal = async () => setLocal([...new Set((await localFonts!()).map((f) => f.family))])
  const addFontFiles = async (files: FileList | null) => {
    const added: FontFile[] = []
    for (const f of Array.from(files ?? [])) added.push({ family: f.name.replace(/\.(ttf|otf|woff2?)$/i, ''), src: viewUrl(await uploadImage(f, f.name)) })
    setDraft((d) => ({ ...d, fontFiles: [...(d.fontFiles ?? []), ...added], fonts: [...new Set([...d.fonts, ...added.map((a) => a.family)])] }))
  }
  return (
    <div className="ca-lib__editor">
      <input className="ca-panel__input" value={draft.name} placeholder={t('libraryPanel.name', KIND_LABELS[draft.kind])} onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      {draft.kind === 'brand' && (
        <>
          <button type="button" className="ca-lib__new" disabled={busy} onClick={() => guide.current?.click()}><span className="ca-icon">{Icons.upload}</span>{busy ? t('libraryPanel.extracting') : t('libraryPanel.extractFromFileBrandGuide')}</button>
          <input ref={guide} type="file" accept="image/*,.pdf" hidden onChange={(e) => { void fromGuide(e.target.files).catch((err) => onError(errorText(err))); e.target.value = '' }} />
          <div className="ca-gen__label">Logo</div>
          <div className="ca-gen__refs ca-lib__images">
            {(draft.logos ?? []).map((src) => (
              <span key={src} className="ca-gen__ref"><img src={src} alt="" /><button type="button" title={t('common.remove')} onClick={() => set({ logos: draft.logos!.filter((x) => x !== src) })}>{Icons.close}</button></span>
            ))}
            <button type="button" className="ca-gen__refadd" onClick={() => logoFile.current?.click()}><span className="ca-icon">{Icons.plus}</span><span>{t('libraryPanel.addLogo')}</span></button>
            <input ref={logoFile} type="file" accept="image/*" multiple hidden onChange={(e) => { void uploaded(e.target.files).then((srcs) => setDraft((d) => ({ ...d, logos: [...(d.logos ?? []), ...srcs] }))).catch((err) => onError(String(err))); e.target.value = '' }} />
          </div>
        </>
      )}
      {draft.kind === 'brand' && <div className="ca-gen__label">{t('libraryPanel.designGuidelines')}</div>}
      <textarea className="ca-panel__prompt ca-panel__prompt--boxed" value={draft.description} placeholder={draft.kind === 'brand' ? t('libraryPanel.describeTheBrandsPersonality') : t('libraryPanel.describeTheLookStyleUse')} onChange={(e) => set({ description: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      <div className="ca-gen__label">{draft.kind === 'brand' ? t('composer.image') : t('common.image')}</div>
      <div className="ca-gen__refs ca-lib__images">
        {draft.images.map((src) => (
          <span key={src} className="ca-gen__ref" data-cover={draft.cover === src || undefined}><img src={src} alt="" /><button type="button" title={t('common.remove')} onClick={() => set({ images: draft.images.filter((x) => x !== src) })}>{Icons.close}</button><span className="ca-gen__refmode" onClick={() => set({ cover: draft.cover === src ? undefined : src })}>{draft.cover === src ? t('libraryPanel.cover') : t('libraryPanel.setAsCover')}</span></span>
        ))}
        <Popover
          open={pick}
          onOpenChange={setPick}
          trigger={({ toggle }) => <button type="button" className="ca-gen__refadd" onClick={toggle}><span className="ca-icon">{Icons.plus}</span><span>{t('common.add')}</span></button>}
        >
          <div className="ca-menu ca-assets-pop">
            <button type="button" className="ca-menu__item" onClick={() => { setPick(false); file.current?.click() }}><span className="ca-icon">{Icons.upload}</span><span className="ca-menu__grow">{t('common.uploadFile')}</span></button>
            <AssetGrid images onPick={(i) => { setPick(false); set({ images: [...draft.images, i.src] }) }} />
          </div>
        </Popover>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(e.target.files).catch((err) => onError(String(err))); e.target.value = '' }} />
      </div>
      {draft.kind === 'brand' && (
        <>
          <div className="ca-gen__label">{t('common.color')}</div>
          {draft.colors.map((c, i) => (
            <div key={i} className="ca-style__row">
              <ColorPicker value={c} title={t('common.color')} allowNone onChange={(v) => set(v ? { colors: draft.colors.map((x, j) => (j === i ? v : x)) } : { colors: draft.colors.filter((_, j) => j !== i), roles: roles.filter((_, j) => j !== i) })} />
              <span className="ca-menu__grow">{c}</span>
              <select className="ca-lib__role" value={roles[i]} onChange={(e) => set({ roles: roles.map((r, j) => (j === i ? e.target.value : r)) })}>
                <option value="">{t('libraryPanel.uncategorized')}</option>
                {Object.entries(COLOR_ROLES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
          ))}
          <button type="button" className="ca-lib__new" onClick={() => set({ colors: [...draft.colors, '#000000'], roles: [...roles, ''] })}><span className="ca-icon">{Icons.plus}</span>{t('libraryPanel.addColor')}</button>
          <div className="ca-gen__label">{t('libraryPanel.fonts')}</div>
          <input className="ca-panel__input" value={draft.fonts.join(', ')} placeholder={t('libraryPanel.fontPlaceholder')} onChange={(e) => set({ fonts: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} onKeyDown={(e) => e.stopPropagation()} />
          {(draft.fontFiles ?? []).map((f) => (
            <div key={f.src} className="ca-memory__row">
              <span className="ca-menu__grow" style={{ fontFamily: f.family }}>{t('libraryPanel.fontSample', f.family)}</span>
              <button type="button" className="ca-history__del" title={t('common.remove')} onClick={() => set({ fontFiles: draft.fontFiles!.filter((x) => x.src !== f.src), fonts: draft.fonts.filter((x) => x !== f.family) })}>{Icons.trash}</button>
            </div>
          ))}
          <div className="ca-style__row">
            <button type="button" className="ca-lib__new" onClick={() => fontFile.current?.click()}><span className="ca-icon">{Icons.upload}</span>{t('libraryPanel.uploadFontFile')}</button>
            {localFonts && <button type="button" className="ca-lib__new" onClick={() => void pickLocal().catch((err) => onError(String(err)))}><span className="ca-icon">{Icons.textTool}</span>{t('libraryPanel.chooseFromLocalFonts')}</button>}
          </div>
          <input ref={fontFile} type="file" accept=".ttf,.otf,.woff,.woff2" multiple hidden onChange={(e) => { void addFontFiles(e.target.files).catch((err) => onError(String(err))); e.target.value = '' }} />
          {local.length > 0 && (
            <div className="ca-lib__fonts">
              {local.map((f) => <button key={f} type="button" className="ca-panel__chip" style={{ fontFamily: f }} data-on={draft.fonts.includes(f) || undefined} onClick={() => set({ fonts: draft.fonts.includes(f) ? draft.fonts.filter((x) => x !== f) : [...draft.fonts, f] })}>{f}</button>)}
            </div>
          )}
        </>
      )}
      <div className="ca-panel__foot">
        <button type="button" className="ca-panel__secondary" onClick={() => onDone(null)}>{t('common.cancel')}</button>
        <button type="button" className="ca-panel__primary" disabled={!draft.name.trim()} onClick={() => onDone({ ...draft, name: draft.name.trim() })}>{t('common.save')}</button>
      </div>
    </div>
  )
}

export function LibraryPanel({ editor, onError }: { editor: Editor; onError: (msg: string) => void }) {
  const tab = useValue(libraryTabAtom)
  const setTab = (t: Tab) => libraryTabAtom.set(t)
  const [editing, setEditing] = useState<LibraryItem | null>(null)
  const library = useValue(libraryAtom)
  const kits = useValue(kitsAtom)
  const items = library.filter((i) => i.kind === tab)
  const save = (list: LibraryItem[]) => saveLibrary(list).catch((e) => onError(String(e)))

  return (
    <div className="ca-lib">
      <div className="ca-assets__bar ca-lib__tabs">
        {TABS.map(([t, label]) => <button key={t} type="button" className="ca-panel__chip" data-on={tab === t || undefined} onClick={() => { setTab(t); setEditing(null) }}>{label}</button>)}
      </div>
      {tab === 'files' && <AssetGrid onPick={(item) => void placeAsset(editor, item)} />}
      {tab !== 'files' && editing && (
        <ItemEditor
          item={editing}
          onError={onError}
          onDone={(item) => {
            setEditing(null)
            if (item) void save(library.some((x) => x.id === item.id) ? library.map((x) => (x.id === item.id ? item : x)) : [...library, item])
          }}
        />
      )}
      {tab !== 'files' && !editing && (
        <>
          <button type="button" className="ca-lib__new" onClick={() => setEditing({ id: uuid().slice(0, 8), kind: tab, name: '', description: '', images: [], colors: [], fonts: [] })}>
            <span className="ca-icon">{Icons.plus}</span>{t('libraryPanel.newItem', KIND_LABELS[tab])}
          </button>
          {items.length === 0 && <div className="ca-side__empty">{t('libraryPanel.emptyHint', KIND_LABELS[tab])}</div>}
          {items.map((item) => (
            <div key={item.id} className="ca-lib__card">
              <div className="ca-lib__cover">{(item.cover ?? item.logos?.[0] ?? item.images[0]) ? <img src={item.cover ?? item.logos?.[0] ?? item.images[0]} alt="" /> : <span className="ca-icon">{Icons.assets}</span>}</div>
              <div className="ca-lib__info">
                <div className="ca-lib__name">{item.name}{item.isDefault && <span className="ca-model__tag">{t('common.default')}</span>}</div>
                <div className="ca-lib__desc">{item.description || t('libraryPanel.images', item.images.length)}</div>
                {item.colors.length > 0 && <div className="ca-lib__colors">{item.colors.map((c) => <span key={c} style={{ background: c }} />)}</div>}
              </div>
              <div className="ca-lib__acts">
                <button type="button" className="ca-history__del" title={t('libraryPanel.addToChat')} disabled={kits.some((k) => k.id === item.id)} onClick={() => kitsAtom.set([...kits, item])}>{Icons.comment}</button>
                <button type="button" className="ca-history__del" title={t('common.edit')} onClick={() => setEditing(item)}>{Icons.textTool}</button>
                <button type="button" className="ca-history__del" title={t('common.copy')} onClick={() => void save([...library, { ...item, id: uuid().slice(0, 8), name: t('libraryPanel.copy', item.name), isDefault: false }])}>{Icons.page}</button>
                {item.kind === 'brand' && (
                  <button type="button" className="ca-history__del" title={t('libraryPanel.designWithThisKitNew')} onClick={() => openProject(uuid().slice(0, 8), item.id)}>{Icons.plus}</button>
                )}
                {item.kind === 'brand' && (
                  <button type="button" className="ca-history__del" title={item.isDefault ? t('libraryPanel.defaultForNewProjectsOn') : t('libraryPanel.setAsDefaultForNew')} data-on={item.isDefault || undefined} onClick={() => void save(library.map((x) => (x.kind === 'brand' ? { ...x, isDefault: x.id === item.id ? !item.isDefault : false } : x)))}>{Icons.check}</button>
                )}
                <button type="button" className="ca-history__del" title={t('common.delete')} onClick={() => confirmAtom.set({ title: t('libraryPanel.deleteItem', KIND_LABELS[item.kind]), desc: t('libraryPanel.itemWillBeRemoved', item.name), ok: t('common.delete'), run: () => void save(libraryAtom.get().filter((x) => x.id !== item.id)) })}>{Icons.trash}</button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
