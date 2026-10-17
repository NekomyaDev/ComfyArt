import { useEffect, useState, type ReactNode } from 'react'

import { Popover } from './Popover'
import { t } from '../i18n'
import { isEnter } from './keys'

const SWATCHES = ['#000000', '#FFFFFF', '#F5F5F5', '#9E9E9E', '#424242', '#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA', '#EC407A']

const valid = (v: string) => /^#[0-9a-f]{6}$/i.test(v)

export function ColorPicker({ value, onChange, title, trigger, allowNone }: {
  value: string
  onChange: (v: string) => void
  title: string
  trigger?: (props: { open: boolean; toggle: () => void }) => ReactNode
  allowNone?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value)
  useEffect(() => setHex(value), [value])
  const set = (v: string) => { if (!v || valid(v)) onChange(v.toUpperCase()) }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      trigger={trigger ?? (({ open: o, toggle }) => (
        <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={title} data-open={o || undefined} onClick={toggle}>
          <span className="ca-tools__dot" data-none={!value || undefined} style={{ background: value || undefined }} />
        </button>
      ))}
    >
      <div className="ca-menu ca-bg">
        <div className="ca-gen__title">{title}</div>
        <div className="ca-bg__swatches ca-bg__swatches--wrap">
          {allowNone && <button type="button" className="ca-bg__swatch ca-bg__none" title={t('common.none')} data-on={!value || undefined} onClick={() => onChange('')} />}
          {SWATCHES.map((c) => (
            <button key={c} type="button" className="ca-bg__swatch" data-on={value.toUpperCase() === c || undefined} style={{ background: c }} onClick={() => set(c)} />
          ))}
          <label className="ca-bg__swatch ca-bg__custom" title={t('common.custom')}>
            <input type="color" value={valid(value) ? value : '#000000'} onChange={(e) => set(e.target.value)} />
          </label>
        </div>
        <label className="ca-bg__hex">
          <span>#</span>
          <input
            value={hex.replace('#', '')}
            maxLength={6}
            onChange={(e) => setHex(`#${e.target.value}`)}
            onBlur={() => set(hex)}
            onKeyDown={(e) => { e.stopPropagation(); if (isEnter(e)) set(hex) }}
          />
        </label>
      </div>
    </Popover>
  )
}
