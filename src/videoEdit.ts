import { t } from './i18n'
export interface Clip { start: number; end: number; speed: number; volume: number }
export type TransitionType = 'none' | 'fade' | 'black' | 'white'
export interface Transition { type: TransitionType; duration: number }
export interface Subtitle { id: string; start: number; end: number; text: string; size: number; color: string }
export interface Edit { clips: Clip[]; transitions: Transition[]; subtitles: Subtitle[] }

export const MIN_CLIP = 0.2
const DRIFT = 0.25

export const clipLength = (c: Clip) => (c.end - c.start) / c.speed

export function freshEdit(duration: number): Edit {
  return { clips: [{ start: 0, end: duration, speed: 1, volume: 1 }], transitions: [], subtitles: [] }
}

export function layout(edit: Edit): { offsets: number[]; total: number } {
  const offsets: number[] = []
  let t = 0
  edit.clips.forEach((c, i) => {
    const tr = edit.transitions[i - 1]
    if (i > 0 && tr?.type === 'fade') t -= Math.min(tr.duration, clipLength(c), clipLength(edit.clips[i - 1]))
    offsets.push(t)
    t += clipLength(c)
  })
  return { offsets, total: Math.max(t, 0) }
}

export interface Frame { layers: { clip: number; src: number; alpha: number }[]; dip: { color: string; alpha: number } | null }

export function sample(edit: Edit, t: number): Frame {
  const { offsets } = layout(edit)
  const layers: Frame['layers'] = []
  let dip: Frame['dip'] = null
  edit.clips.forEach((c, i) => {
    const len = clipLength(c)
    const local = t - offsets[i]
    if (local < 0 || local > len) return
    const prev = edit.transitions[i - 1]
    const next = edit.transitions[i]
    let alpha = 1
    if (prev?.type === 'fade' && local < prev.duration) alpha = local / prev.duration
    layers.push({ clip: i, src: c.start + local * c.speed, alpha })
    const half = (tr: Transition) => tr.duration / 2
    const color = (tr: Transition) => (tr.type === 'white' ? '#ffffff' : '#000000')
    if (next && (next.type === 'black' || next.type === 'white') && local > len - half(next)) {
      dip = { color: color(next), alpha: (local - (len - half(next))) / half(next) }
    }
    if (prev && (prev.type === 'black' || prev.type === 'white') && local < half(prev)) {
      dip = { color: color(prev), alpha: 1 - local / half(prev) }
    }
  })
  return { layers: layers.slice(-2), dip }
}

export function splitAt(edit: Edit, t: number): Edit | null {
  const { offsets } = layout(edit)
  const i = edit.clips.findIndex((c, j) => t > offsets[j] + MIN_CLIP && t < offsets[j] + clipLength(c) - MIN_CLIP)
  if (i < 0) return null
  const c = edit.clips[i]
  const cut = c.start + (t - offsets[i]) * c.speed
  const clips = [...edit.clips.slice(0, i), { ...c, end: cut }, { ...c, start: cut }, ...edit.clips.slice(i + 1)]
  const transitions = [...edit.transitions.slice(0, i), { type: 'none' as const, duration: 0.5 }, ...edit.transitions.slice(i)]
  return { ...edit, clips, transitions }
}

export function removeClip(edit: Edit, i: number): Edit {
  if (edit.clips.length < 2) return edit
  const transitions = [...edit.transitions]
  transitions.splice(Math.min(i, transitions.length - 1), 1)
  return { ...edit, clips: edit.clips.filter((_, j) => j !== i), transitions }
}

export function filmstrip(src: string, count: number, height: number): Promise<{ duration: number; width: number; height: number; thumbs: string[] }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    v.src = src
    v.onerror = () => reject(new Error(t('videoEdit.failedToLoadVideo')))
    v.onloadedmetadata = async () => {
      const c = document.createElement('canvas')
      c.height = height
      c.width = Math.round(height * v.videoWidth / v.videoHeight)
      const ctx = c.getContext('2d')!
      const thumbs: string[] = []
      for (let i = 0; i < count; i++) {
        v.currentTime = ((i + 0.5) * v.duration) / count
        await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
        ctx.drawImage(v, 0, 0, c.width, c.height)
        thumbs.push(c.toDataURL('image/jpeg', 0.7))
      }
      resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, thumbs })
      v.removeAttribute('src')
      v.load()
    }
  })
}

function drawSubtitles(ctx: CanvasRenderingContext2D, edit: Edit, t: number) {
  const { width, height } = ctx.canvas
  for (const s of edit.subtitles) {
    if (t < s.start || t > s.end || !s.text) continue
    const size = (s.size / 1080) * height
    ctx.font = `600 ${size}px Inter, "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.lineJoin = 'round'
    ctx.lineWidth = size / 6
    ctx.strokeStyle = 'rgba(0,0,0,.75)'
    ctx.strokeText(s.text, width / 2, height * 0.92)
    ctx.fillStyle = s.color
    ctx.fillText(s.text, width / 2, height * 0.92)
  }
}

export class Player {
  readonly videos: HTMLVideoElement[]
  private audio: AudioContext
  private gains: GainNode[]
  private out: MediaStreamAudioDestinationNode
  private raf = 0
  private origin = 0
  private time = 0
  playing = false
  onTime: (t: number) => void = () => {}

  constructor(src: string, private canvas: HTMLCanvasElement, private edit: () => Edit) {
    this.audio = new AudioContext()
    this.out = this.audio.createMediaStreamDestination()
    this.videos = [0, 1].map(() => {
      const v = document.createElement('video')
      v.crossOrigin = 'anonymous'
      v.preload = 'auto'
      v.src = src
      return v
    })
    this.gains = this.videos.map((v) => {
      const g = this.audio.createGain()
      this.audio.createMediaElementSource(v).connect(g)
      g.connect(this.audio.destination)
      g.connect(this.out)
      return g
    })
  }

  dispose() {
    this.pause()
    this.videos.forEach((v) => { v.removeAttribute('src'); v.load() })
    void this.audio.close()
  }

  get current() { return this.time }

  private draw(frame: Frame, t: number) {
    const ctx = this.canvas.getContext('2d')!
    ctx.globalAlpha = 1
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    for (const l of frame.layers) {
      ctx.globalAlpha = l.alpha
      ctx.drawImage(this.videos[l.clip % 2], 0, 0, this.canvas.width, this.canvas.height)
    }
    if (frame.dip) {
      ctx.globalAlpha = Math.min(1, Math.max(0, frame.dip.alpha))
      ctx.fillStyle = frame.dip.color
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }
    ctx.globalAlpha = 1
    drawSubtitles(ctx, this.edit(), t)
  }

  private sync(frame: Frame, playing: boolean) {
    const edit = this.edit()
    const used = new Set<number>()
    for (const l of frame.layers) {
      const v = this.videos[l.clip % 2]
      const clip = edit.clips[l.clip]
      used.add(l.clip % 2)
      v.playbackRate = clip.speed
      this.gains[l.clip % 2].gain.value = clip.volume * l.alpha * (frame.dip ? 1 - frame.dip.alpha : 1)
      if (Math.abs(v.currentTime - l.src) > DRIFT || !playing) v.currentTime = l.src
      if (playing && v.paused) void v.play()
      if (!playing && !v.paused) v.pause()
    }
    this.videos.forEach((v, i) => { if (!used.has(i)) { v.pause(); this.gains[i].gain.value = 0 } })
  }

  async seek(t: number) {
    const total = layout(this.edit()).total
    this.time = Math.min(Math.max(t, 0), total)
    const frame = sample(this.edit(), this.time)
    this.sync(frame, false)
    await Promise.all(frame.layers.map((l) => {
      const v = this.videos[l.clip % 2]
      return v.seeking ? new Promise((r) => v.addEventListener('seeked', r, { once: true })) : Promise.resolve()
    }))
    this.draw(frame, this.time)
    this.onTime(this.time)
  }

  play(onEnd?: () => void) {
    if (this.playing) return
    void this.audio.resume()
    const total = layout(this.edit()).total
    if (this.time >= total - 0.05) this.time = 0
    this.playing = true
    this.origin = performance.now() - this.time * 1000
    const tick = () => {
      if (!this.playing) return
      this.time = (performance.now() - this.origin) / 1000
      if (this.time >= layout(this.edit()).total) {
        this.time = layout(this.edit()).total
        this.pause()
        onEnd?.()
        return
      }
      const frame = sample(this.edit(), this.time)
      this.sync(frame, true)
      this.draw(frame, this.time)
      this.onTime(this.time)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  pause() {
    this.playing = false
    cancelAnimationFrame(this.raf)
    this.videos.forEach((v) => v.pause())
  }

  async record(): Promise<Blob> {
    await this.seek(0)
    const stream = new MediaStream([...this.canvas.captureStream(30).getVideoTracks(), ...this.out.stream.getAudioTracks()])
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const done = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' })) })
    recorder.start(250)
    await new Promise<void>((resolve) => this.play(resolve))
    recorder.stop()
    return done
  }
}
