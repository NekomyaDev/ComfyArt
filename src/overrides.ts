import type { TLUiOverrides } from 'tldraw'

import { openCanvasChat } from './canvasChat'
import { arrange } from './ui/MultiToolbar'

const KBD: Record<string, string> = {
  'toggle-lock': 'cmd+shift+l,ctrl+shift+l',
  'bring-forward': 'cmd+],ctrl+]',
  'send-backward': 'cmd+[,ctrl+[',
  'flatten-to-image': 'cmd+e,ctrl+e',
  'zoom-to-100': 'cmd+0,ctrl+0',
}

const UNBOUND_TOOLS = ['eraser', 'draw', 'laser', 'highlight']

export const overrides: TLUiOverrides = {
  tools(_, tools) {
    for (const id of UNBOUND_TOOLS) if (tools[id]) tools[id] = { ...tools[id], kbd: undefined }
    return tools
  },
  actions(editor, actions) {
    for (const [id, kbd] of Object.entries(KBD)) actions[id] = { ...actions[id], kbd }
    actions['select-geo-tool'] = { ...actions['select-geo-tool'], kbd: undefined }
    actions['ca-tidy'] = {
      id: 'ca-tidy',
      kbd: 'shift+a',
      onSelect() {
        const shapes = editor.getSelectedShapes()
        if (shapes.length > 1) arrange(editor, shapes)
      },
    }
    actions['ca-chat'] = {
      id: 'ca-chat',
      kbd: 'shift+enter',
      onSelect() {
        openCanvasChat(editor)
      },
    }
    actions['ca-hide'] = {
      id: 'ca-hide',
      kbd: 'cmd+shift+h,ctrl+shift+h',
      onSelect() {
        const shapes = editor.getSelectedShapes()
        const hidden = !shapes.every((s) => s.meta.hidden)
        editor.updateShapes(shapes.map((s) => ({ id: s.id, type: s.type, meta: { ...s.meta, hidden } })))
      },
    }
    return actions
  },
}
