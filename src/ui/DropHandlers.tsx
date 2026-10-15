import { useEffect } from 'react'
import { defaultHandleExternalFileContent, useEditor, useToasts, useTranslation } from 'tldraw'

import { placeEmbed } from '../embeds'
import { errorText } from '../jobs'
import { isPdf, placePdf } from '../pdf'

export function DropHandlers({ onError }: { onError: (msg: string) => void }) {
  const editor = useEditor()
  const toasts = useToasts()
  const msg = useTranslation()

  useEffect(() => {
    editor.registerExternalContentHandler('files', async ({ point, files }) => {
      const rest: File[] = []
      for (const file of files) {
        try {
          if (isPdf(file)) await placePdf(editor, file, point)
          else if (!(await placeEmbed(editor, file, point))) rest.push(file)
        } catch (e) {
          onError(errorText(e))
        }
      }
      if (rest.length) await defaultHandleExternalFileContent(editor, { point, files: rest }, { toasts, msg })
    })
  }, [editor, toasts, msg, onError])

  return null
}
