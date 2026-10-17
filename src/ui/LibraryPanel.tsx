import { atom, useValue, type Editor } from 'tldraw'

import { kitsAtom } from '../agent'
import { placeAsset } from '../assets'
import { KIND_LABELS, libraryAtom, saveLibrary, type LibraryItem, type LibraryKind } from '../library'
import { openProject } from '../projects'
import { AssetGrid } from './AssetPicker'
import { confirmAtom } from './Confirm'
import { Icons } from './icons'
import { kitEditAtom } from './KitEditor'
import { t } from '../i18n'
import { uuid } from '../id'

type Tab = 'files' | LibraryKind
export const libraryTabAtom = atom<Tab>('library tab', 'files')
const TABS: [Tab, string][] = [['files', t('libraryPanel.files')], ['brand', t('library.brandKit')], ['character', t('library.character')], ['product', t('library.product')], ['custom', t('common.custom')]]

export function LibraryPanel({ editor, onError }: { editor: Editor; onError: (msg: string) => void }) {
  const tab = useValue(libraryTabAtom)
  const setTab = (t: Tab) => libraryTabAtom.set(t)
  const library = useValue(libraryAtom)
  const kits = useValue(kitsAtom)
  const items = library.filter((i) => i.kind === tab)
  const save = (list: LibraryItem[]) => saveLibrary(list).catch((e) => onError(String(e)))
  const create = (kind: LibraryKind) => {
    const id = uuid().slice(0, 8)
    void save([...library, { id, kind, name: '', description: '', images: [], colors: [], fonts: [] }])
    kitEditAtom.set(id)
  }

  return (
    <div className="ca-lib">
      <div className="ca-assets__bar ca-lib__tabs">
        {TABS.map(([t, label]) => <button key={t} type="button" className="ca-panel__chip" data-on={tab === t || undefined} onClick={() => setTab(t)}>{label}</button>)}
      </div>
      {tab === 'files' && <AssetGrid onPick={(item) => void placeAsset(editor, item)} />}
      {tab !== 'files' && (
        <>
          <button type="button" className="ca-lib__new" onClick={() => create(tab)}>
            <span className="ca-icon">{Icons.plus}</span>{t('libraryPanel.newItem', KIND_LABELS[tab])}
          </button>
          {items.length === 0 && <div className="ca-side__empty">{t('libraryPanel.emptyHint', KIND_LABELS[tab])}</div>}
          {items.map((item) => (
            <div key={item.id} className="ca-lib__card">
              <div className="ca-lib__cover">{(item.cover ?? item.logos?.[0] ?? item.images[0]) ? <img src={item.cover ?? item.logos?.[0] ?? item.images[0]} alt="" /> : <span className="ca-icon">{Icons.assets}</span>}</div>
              <div className="ca-lib__info">
                <div className="ca-lib__name">{item.name || t('kitEditor.untitled', KIND_LABELS[item.kind])}{item.isDefault && <span className="ca-model__tag">{t('common.default')}</span>}</div>
                <div className="ca-lib__desc">{item.description || t('libraryPanel.images', item.images.length)}</div>
                {item.colors.length > 0 && <div className="ca-lib__colors">{item.colors.map((c) => <span key={c} style={{ background: c }} />)}</div>}
              </div>
              <div className="ca-lib__acts">
                <button type="button" className="ca-history__del" title={t('libraryPanel.addToChat')} disabled={kits.some((k) => k.id === item.id)} onClick={() => kitsAtom.set([...kits, item])}>{Icons.comment}</button>
                <button type="button" className="ca-history__del" title={t('common.edit')} onClick={() => kitEditAtom.set(item.id)}>{Icons.textTool}</button>
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
