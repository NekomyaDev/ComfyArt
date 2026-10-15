import { DURATIONS, QUALITIES, RATIOS, RESOLUTIONS, SHOTS, STYLES, VIDEO_RATIOS } from '../generate'
import type { GeneratorShape } from '../shapes/GeneratorShape'
import { t } from '../i18n'

const COUNTS = [1, 2, 3, 4]
const RES_LABELS: Record<string, string> = { '1K': '1K', '2K': '2K', custom: t('common.custom') }

function RatioShape({ ratio }: { ratio: string }) {
  const [a, b] = ratio.split(':').map(Number)
  const k = 14 / Math.max(a, b)
  return <span className="ca-gen__shape" style={{ width: a * k, height: b * k }} />
}

function Chips<T extends string | number>({ value, options, onPick }: { value: T; options: [T, string][]; onPick: (v: T) => void }) {
  return (
    <div className="ca-gen__chips">
      {options.map(([v, label]) => <button key={String(v)} type="button" className="ca-gen__chip" data-on={value === v || undefined} onClick={() => onPick(v)}>{label}</button>)}
    </div>
  )
}

export function settingsSummary(p: GeneratorShape['props'], video: boolean) {
  if (video) return `${p.ratio} · ${p.duration}s${p.style ? ` · ${SHOTS.find(([k]) => k === p.style)?.[1]}` : ''}`
  const size = p.resolution === 'custom' ? `${p.cw}×${p.ch}` : `${p.resolution} · ${p.ratio}`
  return t('genSettings.summary', size, p.count, p.transparent ? t('genSettings.transparent') : '')
}

export function GenSettings({ p, video, update }: { p: GeneratorShape['props']; video: boolean; update: (patch: Partial<GeneratorShape['props']>) => void }) {
  const dim = (key: 'cw' | 'ch', v: number) => v >= 64 && v <= 4096 && update({ [key]: v })
  return (
    <div className="ca-menu ca-gen__settings">
      <div className="ca-gen__title">{video ? t('genSettings.videoSettings') : t('genSettings.imageSettings')}</div>
      {!video && (
        <>
          <div className="ca-gen__label">{t('adjustPanel.clarity')}</div>
          <Chips value={p.resolution} options={RESOLUTIONS.map((r) => [r, RES_LABELS[r]] as [string, string])} onPick={(r) => update({ resolution: r })} />
          {p.resolution === 'custom' && (
            <div className="ca-style__row">
              <label className="ca-num"><span>W</span><input type="number" min={64} max={4096} value={p.cw} onChange={(e) => dim('cw', Number(e.target.value))} onKeyDown={(e) => e.stopPropagation()} /></label>
              <label className="ca-num"><span>H</span><input type="number" min={64} max={4096} value={p.ch} onChange={(e) => dim('ch', Number(e.target.value))} onKeyDown={(e) => e.stopPropagation()} /></label>
            </div>
          )}
        </>
      )}
      {(video || p.resolution !== 'custom') && (
        <>
          <div className="ca-gen__label">{t('genSettings.aspectRatio')}</div>
          <div className="ca-gen__ratios">
            {(video ? VIDEO_RATIOS : RATIOS).map((r) => (
              <button key={r} type="button" className="ca-gen__ratio" data-on={p.ratio === r || undefined} onClick={() => update({ ratio: r })}>
                <RatioShape ratio={r} />
                <span>{r}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="ca-gen__label">{video ? t('common.duration') : t('genSettings.count')}</div>
      {video
        ? <Chips value={p.duration} options={DURATIONS.map((d) => [d, `${d}s`] as [number, string])} onPick={(d) => update({ duration: d })} />
        : <Chips value={p.count} options={COUNTS.map((n) => [n, String(n)] as [number, string])} onPick={(n) => update({ count: n })} />}
      {video && (
        <>
          <div className="ca-gen__label">{t('genSettings.cameraMotion')}</div>
          <Chips value={p.style} options={SHOTS.map(([k, label]) => [k, label] as [string, string])} onPick={(s) => update({ style: s })} />
        </>
      )}
      {!video && (
        <>
          <div className="ca-gen__label">{t('genSettings.quality')}</div>
          <Chips value={p.quality} options={QUALITIES} onPick={(q) => update({ quality: q })} />
          <div className="ca-gen__label">{t('refModes.style')}</div>
          <Chips value={p.style} options={STYLES.map(([k, label]) => [k, label] as [string, string])} onPick={(s) => update({ style: s })} />
          <label className="ca-panel__row ca-gen__toggle"><span>{t('genSettings.transparentBackground')}</span><input type="checkbox" checked={p.transparent} onChange={(e) => update({ transparent: e.target.checked })} /></label>
        </>
      )}
    </div>
  )
}
