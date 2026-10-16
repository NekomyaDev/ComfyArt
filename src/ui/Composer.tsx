import { useEffect, useRef, useState } from 'react'
import { useValue, type Editor, type TLImageShape, type TLShapeId } from 'tldraw'

import { agentModeAtom, draftAtom, extraRefsAtom, generateDirect, kitsAtom, sendToAgent, srcOf, type AgentMode } from '../agent'
import { placeAsset } from '../assets'
import { botEnabledAtom, messagesAtom } from '../bot'
import { uploadImage, viewUrl } from '../comfy'
import { errorText, placeMedia, toMedia } from '../jobs'
import { KIND_LABELS, libraryAtom } from '../library'
import { loadSkills, saveSkill, skillAtom, type Skill } from '../skills'
import { AssetGrid } from './AssetPicker'
import { schedulesOpenAtom } from '../schedules'
import { AgentPicker } from './AgentPicker'
import { Icons } from './icons'
import { ModelPrefs } from './ModelPrefs'
import { VoiceButton } from './VoiceButton'
import { skillsOpenAtom } from './SkillsDialog'
import { Popover } from './Popover'
import { t } from '../i18n'
import { uuid } from '../id'

const MODES: [AgentMode, string, keyof typeof Icons][] = [['agent', 'Agent', 'agent'], ['image', t('composer.image'), 'genImage'], ['video', t('common.video'), 'genVideo']]
const REVIEW_PROMPT = t('composer.canvasReviewUseGetCanvas')
const SKILL_PROMPT = t('composer.turnTheApproachCompletedIn')

function imageName(editor: Editor, s: TLImageShape) {
  const asset = s.props.assetId ? editor.getAsset(s.props.assetId) : null
  return (asset?.type === 'image' && asset.props.name) || t('common.image')
}

function SkillEditor({ onDone }: { onDone: (s: Skill | null) => void }) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  return (
    <div className="ca-menu ca-skilled">
      <div className="ca-gen__title">{t('composer.skillCreator')}</div>
      <input className="ca-panel__input" value={name} placeholder={t('composer.skillName')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <textarea className="ca-panel__prompt ca-panel__prompt--boxed" value={text} placeholder={t('composer.instructionsForTheAgentDeliverables')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="ca-panel__foot">
        <button type="button" className="ca-panel__secondary" onClick={() => onDone(null)}>{t('common.cancel')}</button>
        <button
          type="button"
          className="ca-panel__primary"
          disabled={!name.trim() || !text.trim()}
          onClick={() => onDone({ id: uuid().slice(0, 8), name: name.trim(), instructions: text.trim(), custom: true })}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  )
}

export function Composer({ editor, busy, onError }: { editor: Editor; busy: boolean; onError: (msg: string) => void }) {
  const started = useValue('chat started', () => messagesAtom.get().length > 0, [])
  const draft = useValue(draftAtom)
  const mode = useValue(agentModeAtom)
  const enabled = useValue(botEnabledAtom)
  const agentOff = mode === 'agent' && enabled === false
  const skill = useValue(skillAtom)
  const extra = useValue(extraRefsAtom)
  const kits = useValue(kitsAtom)
  const library = useValue(libraryAtom)
  const selected = useValue('selected images', () => editor.getSelectedShapes().filter((s): s is TLImageShape => s.type === 'image'), [editor])
  const images = useValue('canvas images', () => editor.getCurrentPageShapes().filter((s): s is TLImageShape => s.type === 'image'), [editor])
  const [menu, setMenu] = useState<'plus' | 'skills' | 'assets' | 'mode' | 'create' | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const file = useRef<HTMLInputElement>(null)

  const refs = [...selected, ...extra.map((id) => editor.getShape<TLImageShape>(id)).filter((s): s is TLImageShape => !!s && !selected.some((x) => x.id === s.id))]
  const slash = /^\/(\S*)$/.exec(draft)
  const at = /(?:^|\s)@(\S*)$/.exec(draft)

  useEffect(() => {
    if (menu === 'skills' || slash) void loadSkills().then(setSkills)
  }, [menu, !!slash])

  const addRef = (id: TLShapeId) => extraRefsAtom.set([...extraRefsAtom.get().filter((x) => x !== id), id])
  const useSkill = (s: Skill) => { skillAtom.set(s); setMenu(null); if (slash) draftAtom.set('') }

  const upload = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      const ref = await uploadImage(f, f.name)
      const m = await toMedia(ref, 'image')
      const center = editor.getViewportPageBounds().center
      const w = Math.min(m.w, 512)
      addRef(placeMedia(editor, { ...m, src: viewUrl(ref) }, f.name, center.x - w / 2, center.y - w * m.h / m.w / 2, w))
    }
  }

  const fail = (e: unknown) => onError(errorText(e))
  const send = () => {
    const text = draft.trim()
    if (!text || agentOff) return
    draftAtom.set('')
    extraRefsAtom.set([])
    kitsAtom.set([])
    void (mode === 'agent' ? sendToAgent(editor, text, refs, skill, kits) : generateDirect(editor, text, refs, mode === 'video', onError)).catch(fail)
  }

  const filtered = slash ? skills.filter((s) => s.name.includes(slash[1])) : skills
  const mentions = at ? images.filter((s) => imageName(editor, s).toLowerCase().includes(at[1].toLowerCase())).slice(0, 8) : []
  const kitMentions = at ? library.filter((k) => k.name.toLowerCase().includes(at[1].toLowerCase()) && !kits.some((x) => x.id === k.id)).slice(0, 8) : []
  const clearAt = () => draftAtom.set(draft.slice(0, at!.index) + (at!.index ? ' ' : ''))
  const modeInfo = MODES.find(([m]) => m === mode)!

  return (
    <div className="ca-composer">
      {(slash && filtered.length > 0) && (
        <div className="ca-menu ca-composer__suggest">
          {filtered.slice(0, 8).map((s) => (
            <button key={s.id} type="button" className="ca-menu__item" onClick={() => useSkill(s)}>
              <span className="ca-icon">{Icons.skill}</span><span className="ca-menu__grow">{s.name}</span>
            </button>
          ))}
        </div>
      )}
      {(mentions.length > 0 || kitMentions.length > 0) && (
        <div className="ca-menu ca-composer__suggest">
          {kitMentions.map((k) => (
            <button key={k.id} type="button" className="ca-menu__item" onClick={() => { kitsAtom.set([...kits, k]); clearAt() }}>
              {k.images[0] ? <img className="ca-composer__mini" src={k.images[0]} alt="" /> : <span className="ca-icon">{Icons.assets}</span>}
              <span className="ca-menu__grow">{k.name}</span><span className="ca-menu__key">{KIND_LABELS[k.kind]}</span>
            </button>
          ))}
          {mentions.map((s) => (
            <button key={s.id} type="button" className="ca-menu__item" onClick={() => { addRef(s.id); clearAt() }}>
              <img className="ca-composer__mini" src={srcOf(editor, s) ?? ''} alt="" /><span className="ca-menu__grow">{imageName(editor, s)}</span>
            </button>
          ))}
        </div>
      )}
      {(refs.length > 0 || skill || kits.length > 0) && (
        <div className="ca-composer__chips">
          {kits.map((k) => (
            <span key={k.id} className="ca-chip">
              <span className="ca-icon">{Icons.assets}</span>{k.name}
              <button type="button" title={t('common.remove')} onClick={() => kitsAtom.set(kits.filter((x) => x.id !== k.id))}>{Icons.close}</button>
            </span>
          ))}
          {skill && (
            <span className="ca-chip">
              <span className="ca-icon">{Icons.skill}</span>{skill.name}
              <button type="button" title={t('common.remove')} onClick={() => skillAtom.set(null)}>{Icons.close}</button>
            </span>
          )}
          {refs.map((r) => (
            <span key={r.id} className="ca-chip ca-chip--image">
              <img src={srcOf(editor, r) ?? ''} alt="" />
              {extra.includes(r.id) && <button type="button" title={t('common.remove')} onClick={() => extraRefsAtom.set(extra.filter((x) => x !== r.id))}>{Icons.close}</button>}
            </span>
          ))}
        </div>
      )}
      <textarea
        className="ca-composer__input"
        value={draft}
        placeholder={t('composer.describeYourDesignNeedsFor')}
        onChange={(e) => draftAtom.set(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && !e.shiftKey && !slash && !mentions.length && !kitMentions.length) {
            e.preventDefault()
            send()
          }
        }}
      />
      <div className="ca-composer__foot">
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(e.target.files).catch((err) => onError(String(err))); e.target.value = '' }} />
        <Popover
          open={menu === 'plus' || menu === 'skills' || menu === 'assets' || menu === 'create'}
          onOpenChange={(o) => setMenu(o ? 'plus' : null)}
          side="top"
          contentKey={menu ?? ''}
          trigger={({ open, toggle }) => (
            <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('common.add')} data-open={open || undefined} onClick={toggle}>
              <span className="ca-icon">{Icons.plus}</span>
            </button>
          )}
        >
          {menu === 'plus' && (
            <div className="ca-menu">
              <button type="button" className="ca-menu__item" onClick={() => { setMenu(null); file.current?.click() }}>
                <span className="ca-icon">{Icons.upload}</span><span className="ca-menu__grow">{t('common.uploadFile')}</span>
              </button>
              <div className="ca-menu__sep" />
              <button type="button" className="ca-menu__item" onClick={() => { setMenu(null); void sendToAgent(editor, REVIEW_PROMPT, [], null).catch(fail) }}>
                <span className="ca-icon">{Icons.search}</span><span className="ca-menu__grow">{t('composer.canvasReview')}</span>
              </button>
              <button type="button" className="ca-menu__item" onClick={() => { setMenu(null); schedulesOpenAtom.set(draft.trim() ? { prompt: draft.trim() } : {}) }}>
                <span className="ca-icon">{Icons.bell}</span><span className="ca-menu__grow">{t('composer.scheduledTask')}</span>
              </button>
              <button type="button" className="ca-menu__item" onClick={() => setMenu('skills')}>
                <span className="ca-icon">{Icons.skill}</span><span className="ca-menu__grow">Skill</span><span className="ca-icon">{Icons.next}</span>
              </button>
              <button type="button" className="ca-menu__item" onClick={() => setMenu('assets')}>
                <span className="ca-icon">{Icons.files}</span><span className="ca-menu__grow">{t('composer.addAssets')}</span><span className="ca-icon">{Icons.next}</span>
              </button>
            </div>
          )}
          {menu === 'skills' && (
            <div className="ca-menu ca-skills">
              <button type="button" className="ca-menu__item" onClick={() => setMenu('create')}>
                <span className="ca-icon">{Icons.plus}</span><span className="ca-menu__grow">{t('composer.skillCreator')}</span>
              </button>
              <button type="button" className="ca-menu__item" disabled={!started} onClick={() => { setMenu(null); void sendToAgent(editor, SKILL_PROMPT, [], null).catch(fail) }}>
                <span className="ca-icon">{Icons.agent}</span><span className="ca-menu__grow">{t('composer.createSkillFromThisChat')}</span>
              </button>
              <button type="button" className="ca-menu__item" onClick={() => { setMenu(null); skillsOpenAtom.set(true) }}>
                <span className="ca-icon">{Icons.files}</span><span className="ca-menu__grow">{t('composer.manageSkills')}</span>
              </button>
              <div className="ca-menu__sep" />
              {skills.map((s) => (
                <button key={s.id} type="button" className="ca-menu__item" title={s.instructions} onClick={() => useSkill(s)}>
                  <span className="ca-menu__grow">{s.name}</span>
                  {s.custom && <span className="ca-menu__key">{t('composer.personal')}</span>}
                </button>
              ))}
            </div>
          )}
          {menu === 'assets' && (
            <div className="ca-menu ca-assets-pop">
              <AssetGrid images onPick={(item) => { setMenu(null); void placeAsset(editor, item).then((id) => id && addRef(id)) }} />
            </div>
          )}
          {menu === 'create' && (
            <SkillEditor
              onDone={(s) => {
                setMenu(null)
                if (!s) return
                void saveSkill(s).then(() => skillAtom.set(s)).catch((e) => onError(String(e)))
              }}
            />
          )}
        </Popover>
        <Popover
          open={menu === 'mode'}
          onOpenChange={(o) => setMenu(o ? 'mode' : null)}
          side="top"
          trigger={({ open, toggle }) => (
            <button type="button" className="ca-bar__btn ca-composer__mode" data-open={open || undefined} onClick={toggle}>
              <span className="ca-icon">{Icons[modeInfo[2]]}</span><span>{modeInfo[1]}</span><span className="ca-icon">{Icons.chevron}</span>
            </button>
          )}
        >
          <div className="ca-menu">
            {MODES.map(([m, label, icon]) => (
              <button key={m} type="button" className="ca-menu__item" onClick={() => { agentModeAtom.set(m); setMenu(null) }}>
                <span className="ca-icon">{Icons[icon]}</span><span className="ca-menu__grow">{label}</span>
                {m === mode && <span className="ca-icon">{Icons.check}</span>}
              </button>
            ))}
          </div>
        </Popover>
        {mode === 'agent' && !agentOff && <AgentPicker onError={onError} />}
        {mode === 'agent' && <ModelPrefs onError={onError} />}
        <div className="ca-gen__spacer" />
        <VoiceButton onError={onError} onText={(t) => draftAtom.set(`${draftAtom.get()}${draftAtom.get() ? ' ' : ''}${t}`)} />
        <button type="button" className="ca-gen__send" disabled={!draft.trim() || agentOff} title={busy && mode === 'agent' ? t('composer.sendQueuedAfterTheCurrent') : t('composer.send')} onClick={send}>
          <span className="ca-icon">{Icons.send}</span>
        </button>
      </div>
    </div>
  )
}
