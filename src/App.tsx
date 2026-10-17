import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSnapshot, loadSnapshot, Tldraw, useValue, type Editor, type TLAssetStore, type TLComponents, type TLShape } from 'tldraw'
import 'tldraw/tldraw.css'

import { uploadImage, viewUrl } from './comfy'
import { svgRaster } from './vectorize'
import { resumeJobs } from './jobs'
import './layers'
import { maybeSaveVersion } from './history'
import { defaultKitId, loadLibrary } from './library'
import { loadMemory } from './memory'
import { loadModels } from './models'
import { loadProject, saveProject, touchProject } from './projects'
import { markDark, themeAtom } from './theme'
import { CommentShapeUtil, CommentTool } from './shapes/CommentShape'
import { HtmlShapeUtil, LottieShapeUtil, ModelShapeUtil } from './shapes/EmbedShapes'
import { DoodleShapeUtil, DoodleTool } from './shapes/DoodleShape'
import { TextShapeUtil, TextTool } from './shapes/TextShape'
import { VectorShapeUtil, VectorTool } from './shapes/VectorShape'
import { GeneratorShapeUtil } from './shapes/GeneratorShape'
import { AdjustPanel } from './ui/AdjustPanel'
import { AgentPanel, chatViewAtom, dockAtom, type ChatView } from './ui/AgentPanel'
import { BatchRename } from './ui/BatchRename'
import { CanvasMenu } from './ui/CanvasMenu'
import { CanvasTools } from './ui/CanvasTools'
import { CommentPanel } from './ui/CommentPanel'
import { Confirm } from './ui/Confirm'
import { Dock } from './ui/Dock'
import { DropHandlers } from './ui/DropHandlers'
import { EmbedToolbar, HtmlPreview } from './ui/EmbedToolbar'
import { Effects } from './ui/Effects'
import { HistoryDialog } from './ui/HistoryDialog'
import { ExportDialog } from './ui/ExportDialog'
import { FrameToolbar, registerFrameRules } from './ui/FrameToolbar'
import { EditLayers } from './ui/EditLayers'
import { GenPanel } from './ui/GenPanel'
import { ImageToolbar } from './ui/ImageToolbar'
import { InfoDialog } from './ui/InfoDialog'
import { NoticeCenter } from './ui/NoticeCenter'
import { loadNotices } from './notices'
import { startScheduler } from './schedules'
import { ScheduleDialog } from './ui/ScheduleDialog'
import { startBot } from './bot'
import { registerCommandBus } from './botCommands'
import { BotSettings } from './ui/BotSettings'
import { TaskDetails } from './ui/TaskDetails'
import { InpaintPanel } from './ui/InpaintPanel'
import { SkillsDialog } from './ui/SkillsDialog'
import { Slideshow } from './ui/Slideshow'
import { SmudgePanel } from './ui/SmudgePanel'
import { Lightbox } from './ui/Lightbox'
import { Icons } from './ui/icons'
import { MemoryDialog } from './ui/MemoryDialog'
import { ModePanel } from './ui/ModePanel'
import { MultiToolbar } from './ui/MultiToolbar'
import { ProjectHeader } from './ui/ProjectHeader'
import { SelectionLabel } from './ui/SelectionLabel'
import { Shortcuts } from './ui/Shortcuts'
import { StylePanel } from './ui/StylePanel'
import { SidePanel } from './ui/SidePanel'
import { ShapeToolbar, TextToolbar } from './ui/StyleToolbars'
import { TopBar } from './ui/TopBar'
import { VideoEditor } from './ui/VideoEditor'
import { VideoToolbar } from './ui/VideoToolbar'
import { Zoom } from './ui/Zoom'
import { lang, t } from './i18n'
import { uuid } from './id'

const SAVE_DELAY = 800
const CHANNEL = 'comfyart-projects'
const TAB = uuid()
const assetUrls = getAssetUrlsByImport()
const shapeUtils = [GeneratorShapeUtil, CommentShapeUtil, DoodleShapeUtil, TextShapeUtil, VectorShapeUtil, LottieShapeUtil, ModelShapeUtil, HtmlShapeUtil]
const tools = [CommentTool, DoodleTool, TextTool, VectorTool]
const getShapeVisibility = (shape: TLShape) => (shape.meta.hidden ? 'hidden' as const : 'inherit' as const)

const components: TLComponents = {
  ContextMenu: CanvasMenu,
  Toolbar: null,
  StylePanel: null,
  MainMenu: null,
  PageMenu: null,
  NavigationPanel: null,
  HelpMenu: null,
  ActionsMenu: null,
  QuickActions: null,
  ImageToolbar: null,
  VideoToolbar: null,
  MenuPanel: null,
  TopPanel: null,
  SharePanel: null,
  HelperButtons: null,
  DebugPanel: null,
  DebugMenu: null,
  Minimap: null,
}

function projectId(): string {
  const url = new URL(location.href)
  let id = url.searchParams.get('project')
  if (!id) {
    id = uuid().slice(0, 8)
    url.searchParams.set('project', id)
    history.replaceState(null, '', url)
  }
  return id
}

const assets: TLAssetStore = {
  async upload(_asset, file) {
    const ref = await uploadImage(file, file.name || 'image.png')
    return { src: viewUrl(ref) }
  },
  resolve(asset, ctx) {
    const src = asset.props.src
    if (!src || ctx.shouldResolveToOriginal || asset.type !== 'image' || asset.props.mimeType !== 'image/svg+xml') return src
    return svgRaster(src, asset.props.w, asset.props.h, ctx.steppedScreenScale * ctx.dpr)
  },
}

export function App() {
  const id = useMemo(projectId, [])
  const [editor, setEditor] = useState<Editor | null>(null)
  const [error, setError] = useState('')
  const chat = useValue(chatViewAtom)
  const setChat = (view: ChatView) => chatViewAtom.set(view)
  const saveTimer = useRef<number>(0)
  const [stale, setStale] = useState(false)
  const staleRef = useRef(false)
  const dock = useValue(dockAtom)
  const dark = useValue('dark mode', () => editor?.user.getIsDarkMode() ?? false, [editor])

  useEffect(() => {
    if (editor) markDark(dark)
  }, [editor, dark])

  useEffect(() => {
    void Promise.all([loadMemory(), loadModels(), loadNotices()]).catch((e) => setError(String(e)))
  }, [])

  const onMount = useCallback((ed: Editor) => {
    ed.user.updateUserPreferences({ colorScheme: themeAtom.get(), locale: lang === 'zh' ? 'zh-cn' : 'en' })
    setEditor(ed)
    return registerFrameRules(ed)
  }, [])

  useEffect(() => {
    if (!editor) return
    let alive = true
    let ready = false
    let stopScheduler = () => { }
    let stopCommands = () => { }
    const stopBot = startBot(id, () => staleRef.current)
    Promise.all([loadProject(id), loadLibrary()])
      .then(([snap]) => {
        if (!alive) return
        if (snap) loadSnapshot(editor.store, snap)
        const doc = editor.getDocumentSettings()
        const kit = new URL(location.href).searchParams.get('kit')
        if (!snap && !('brandKit' in doc.meta)) editor.updateDocumentSettings({ meta: { ...doc.meta, brandKit: kit ?? defaultKitId() } })
        if (kit) {
          const url = new URL(location.href)
          url.searchParams.delete('kit')
          history.replaceState(null, '', url)
        }
        for (const page of editor.getPages()) {
          if (/^Page \d+$/.test(page.name)) editor.renamePage(page.id, page.name.replace('Page', t('app.page')))
        }
        ready = true
        resumeJobs(editor, setError)
        stopScheduler = startScheduler(editor, setError)
        stopCommands = registerCommandBus(editor, id, () => staleRef.current, setError)
      })
      .catch((e) => setError(String(e)))
    const stop = editor.store.listen(() => {
      if (!ready) return
      clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        if (staleRef.current) return
        saveProject(id, getSnapshot(editor.store))
          .then(() => {
            channel.postMessage({ project: id, tab: TAB })
            maybeSaveVersion(id, () => getSnapshot(editor.store), editor.store.query.records('shape').get().length)
            return touchProject(id, editor.getDocumentSettings().name)
          })
          .catch((e) => setError(String(e)))
      }, SAVE_DELAY)
    }, { scope: 'document' })
    const channel = new BroadcastChannel(CHANNEL)
    channel.onmessage = (e: MessageEvent<{ project: string; tab: string }>) => {
      if (e.data.project !== id || e.data.tab === TAB) return
      staleRef.current = true
      setStale(true)
    }
    return () => {
      alive = false
      stopScheduler()
      stopCommands()
      stopBot()
      channel.close()
      stop()
      clearTimeout(saveTimer.current)
    }
  }, [editor, id])

  return (
    <div className="ca-root" data-chat={chat} data-dock={dock}>
      {editor && chat !== 'closed' && (
        <AgentPanel
          editor={editor}
          projectId={id}
          max={chat === 'max'}
          onMax={() => setChat(chat === 'max' ? 'open' : 'max')}
          onCollapse={() => setChat('closed')}
          onError={setError}
        />
      )}
      <div className="ca-main">
        {editor && (
          <TopBar
            editor={editor}
            left={chat === 'closed' && (
              <ProjectHeader editor={editor} projectId={id}>
                <NoticeCenter editor={editor} />
                <button type="button" className="ca-bar__btn ca-bar__btn--icon" title={t('app.expandChat')} onClick={() => setChat('open')}>
                  <span className="ca-icon">{dock === 'left' ? Icons.panel : Icons.panelRight}</span>
                </button>
              </ProjectHeader>
            )}
          />
        )}
        <div className="ca-body">
          <div className="ca-canvas">
            <Tldraw
              assets={assets}
              assetUrls={assetUrls}
              shapeUtils={shapeUtils}
              tools={tools}
              components={components}
              getShapeVisibility={getShapeVisibility}
              onMount={onMount}
            >
              <DropHandlers onError={setError} />
              <SelectionLabel />
              <EditLayers />
              <ImageToolbar onError={setError} />
              <ModePanel onError={setError} />
              <AdjustPanel onError={setError} />
              <InpaintPanel onError={setError} />
              <SmudgePanel onError={setError} />
              <StylePanel onError={setError} />
              <Effects />
              <VideoToolbar onError={setError} />
              <GenPanel onError={setError} />
              <CommentPanel onError={setError} />
              <MultiToolbar onError={setError} />
              <TextToolbar onError={setError} />
              <ShapeToolbar />
              <FrameToolbar onError={setError} />
              <EmbedToolbar onError={setError} />
              <Dock />
              <CanvasTools zoom={<Zoom />} />
            </Tldraw>
          </div>
          {editor && <SidePanel editor={editor} onError={setError} />}
        </div>
      </div>
      <Shortcuts />
      <Confirm />
      {editor && <BatchRename editor={editor} />}
      {editor && <Lightbox editor={editor} />}
      {editor && <Slideshow editor={editor} />}
      <HtmlPreview />
      {editor && <InfoDialog editor={editor} onError={setError} />}
      {editor && <TaskDetails editor={editor} />}
      {editor && <ScheduleDialog editor={editor} onError={setError} />}
      <BotSettings onError={setError} />
      {editor && <VideoEditor editor={editor} onError={setError} />}
      <MemoryDialog onError={setError} />
      <SkillsDialog onError={setError} />
      {editor && <HistoryDialog editor={editor} projectId={id} onError={setError} />}
      {editor && <ExportDialog editor={editor} onError={setError} />}
      {error && <div className="ca-error" onClick={() => setError('')}>{error}</div>}
      {stale && (
        <div className="ca-stale">
          <span>{t('app.yourFileVersionIsOut')}</span>
          <button type="button" className="ca-panel__primary" onClick={() => location.reload()}>{t('app.refresh')}</button>
        </div>
      )}
    </div>
  )
}
