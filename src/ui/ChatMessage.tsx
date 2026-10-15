import { useState } from 'react'
import type { Editor } from 'tldraw'

import { answerAsk, outputsOf, toolLabel, toolName, type BotBlock, type BotMessage } from '../bot'
import { draftAtom } from '../agent'
import { errorText } from '../jobs'
import { schedulesOpenAtom } from '../schedules'
import { Icons } from './icons'
import { Markdown } from './Markdown'
import { Thumb } from './TaskDetails'
import { t } from '../i18n'

const GEN_TOOLS = new Set(['generate_image', 'generate_video', 'edit_image', 'animate_image', 'upscale_image', 'remove_background', 'expand_image', 'split_layers', 'change_angle', 'replace_text', 'extend_video', 'create_slides'])

export function textOf(m: BotMessage): string {
  return m.blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim()
}

function summary(b: BotBlock): string {
  const input = b.input ?? {}
  const name = toolName(b.name)
  if (name === 'memory') return [input.action, input.text ?? input.new].filter(Boolean).join(t('chatMessage.colon'))
  if (name === 'skill') return [input.action, input.name].filter(Boolean).join(' ')
  return String(input.prompt ?? input.text ?? input.name ?? input.title ?? '').slice(0, 80)
}

function Step({ editor, use, result }: { editor: Editor; use: BotBlock; result?: BotBlock }) {
  const [open, setOpen] = useState(false)
  const outputs = result ? outputsOf([result]) : []
  const state = !result ? t('chatMessage.inProgress') : result.status === 'error' ? t('chatMessage.failed') : result.duration_ms != null ? `${(result.duration_ms / 1000).toFixed(1)}s` : ''
  return (
    <div className="ca-chat__tool" data-error={result?.status === 'error' || undefined}>
      <button type="button" className="ca-chat__step" onClick={() => setOpen(!open)}>
        <span className="ca-icon">{GEN_TOOLS.has(toolName(use.name)) ? Icons.genImage : result?.status === 'error' ? Icons.close : result ? Icons.check : Icons.agent}</span>
        <span>{toolLabel(use.name)}</span>
        <span className="ca-chat__arg">{summary(use)}</span>
        <span className="ca-chat__status">{state}</span>
      </button>
      {open && (
        <div className="ca-chat__io">
          <pre>{JSON.stringify(use.input ?? {}, null, 2)}</pre>
          {result?.text && <pre>{result.text}</pre>}
        </div>
      )}
      {outputs.length > 0 && <div className="ca-chat__thumbs">{outputs.map((s) => <Thumb key={s} editor={editor} src={s} />)}</div>}
    </div>
  )
}

function Ask({ b }: { b: BotBlock }) {
  const [picked, setPicked] = useState<string[]>([])
  const [other, setOther] = useState('')
  const [error, setError] = useState('')
  const multi = (b.max_selections ?? 1) > 1
  const options = b.options ?? []
  if (b.status !== 'pending') {
    const labels = (b.selected ?? []).map((id) => options.find((o) => o.id === id)?.label ?? id)
    return (
      <div className="ca-chat__memo">
        <span className="ca-icon">{Icons.check}</span>
        {b.prompt} → {b.status === 'answered' ? [...labels, b.other_text].filter(Boolean).join(t('common.listSep')) : b.status === 'expired' ? t('chatMessage.timedOut') : t('chatMessage.canceled')}
      </div>
    )
  }
  const toggle = (id: string) => setPicked(multi ? (picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]) : [id])
  const submit = (selected: string[]) => void answerAsk(b.ask_id!, selected, other.trim()).catch((e) => setError(errorText(e)))
  return (
    <div className="ca-ask">
      <div className="ca-ask__title">{b.prompt}{multi && <span className="ca-menu__key">{t('chatMessage.multipleChoice')}</span>}</div>
      <div className="ca-panel__chips">
        {options.map((o) => (
          <button key={o.id} type="button" className="ca-panel__chip" title={o.description} data-on={picked.includes(o.id) || undefined} onClick={() => (b.kind === 'run_approval' ? submit([o.id]) : toggle(o.id))}>{o.label}</button>
        ))}
      </div>
      {b.allow_other && <input className="ca-panel__input" value={other} placeholder={t('chatMessage.orWriteYourOwn')} onChange={(e) => setOther(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />}
      {error && <div className="ca-chat__hint">{error}</div>}
      {b.kind !== 'run_approval' && (
        <div className="ca-panel__foot">
          <button type="button" className="ca-panel__primary" disabled={!picked.length && !other.trim()} onClick={() => submit(picked)}>{t('chatMessage.submit')}</button>
        </div>
      )}
    </div>
  )
}

function Task({ editor, b }: { editor: Editor; b: BotBlock }) {
  return (
    <div className="ca-chat__task">
      <div className="ca-chat__step">
        <span className="ca-icon">{b.detail?.tool === 'generate_image' ? Icons.genImage : Icons.genVideo}</span>
        <span>{b.label}</span>
        <span className="ca-chat__status">{b.error ? t('chatMessage.generationFailed') : b.srcs ? '' : t('chatMessage.generating')}</span>
      </div>
      {b.srcs && <div className="ca-chat__thumbs">{b.srcs.map((s) => <Thumb key={s} editor={editor} src={s} />)}</div>}
    </div>
  )
}

export function AssistantBlocks({ editor, m }: { editor: Editor; m: BotMessage }) {
  const results = new Map(m.blocks.filter((b) => b.type === 'tool_result' && b.id).map((b) => [b.id, b]))
  return (
    <>
      {m.blocks.map((b, i) => {
        if (b.type === 'text') return <Markdown key={i} text={b.text ?? ''} />
        if (b.type === 'tool_use') return <Step key={i} editor={editor} use={b} result={b.id ? results.get(b.id) : m.blocks[i + 1]?.type === 'tool_result' ? m.blocks[i + 1] : undefined} />
        if (b.type === 'ask') return <Ask key={b.ask_id ?? i} b={b} />
        if (b.type === 'task') return <Task key={i} editor={editor} b={b} />
        if (b.type === 'notice') return <div key={i} className="ca-chat__notice" data-level={b.level}>{b.text}</div>
        return null
      })}
    </>
  )
}

export function UserMessage({ editor, m, onBranch }: { editor: Editor; m: BotMessage; onBranch?: () => void }) {
  const text = textOf(m)
  const media = m.blocks.filter((b) => b.type === 'image' || b.type === 'video')
  return (
    <div className="ca-chat__user" data-queued={m.status === 'queued' || undefined}>
      <div className="ca-chat__acts">
        <button type="button" className="ca-history__del" title={t('chatMessage.editAgain')} onClick={() => draftAtom.set(text)}>{Icons.textTool}</button>
        <button type="button" className="ca-history__del" title={t('common.copy')} onClick={() => void navigator.clipboard.writeText(text)}>{Icons.page}</button>
        <button type="button" className="ca-history__del" title={t('chatMessage.setAsScheduledTask')} onClick={() => schedulesOpenAtom.set({ prompt: text })}>{Icons.bell}</button>
        {onBranch && <button type="button" className="ca-history__del" title={t('chatMessage.forkNewChatFromHere')} onClick={onBranch}>{Icons.merge}</button>}
      </div>
      {media.length > 0 && <div className="ca-chat__thumbs">{media.map((b) => <Thumb key={b.url} editor={editor} src={b.url!} />)}</div>}
      {m.blocks.filter((b) => b.type === 'skill').map((b) => <span key={b.name} className="ca-chip"><span className="ca-icon">{Icons.skill}</span>{b.name}</span>)}
      {m.blocks.filter((b) => b.type === 'kit').map((b) => <span key={b.name} className="ca-chip"><span className="ca-icon">{Icons.assets}</span>{b.name}</span>)}
      {text && <div className="ca-chat__bubble">{text}</div>}
      {m.status === 'queued' && <span className="ca-chat__hint">{t('chatMessage.queuedSendsAfterTheCurrent')}</span>}
    </div>
  )
}
