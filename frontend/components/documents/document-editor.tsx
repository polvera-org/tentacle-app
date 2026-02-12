'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef } from 'react'
import { VoiceCapture } from '@/components/voice-capture'
import { EditorToolbar } from './editor-toolbar'

interface DocumentEditorProps {
  initialContent: JSONContent | null
  onContentChange: (content: JSONContent) => void
  editorRef?: React.MutableRefObject<Editor | null>
  showVoiceCapture?: boolean
}

export function DocumentEditor({ initialContent, onContentChange, editorRef, showVoiceCapture = true }: DocumentEditorProps) {
  const onContentChangeRef = useRef(onContentChange)

  useEffect(() => {
    onContentChangeRef.current = onContentChange
  }, [onContentChange])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
    ],
    content: initialContent || { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onContentChangeRef.current(editor.getJSON())
    },
    editorProps: {
      attributes: {
        class: 'min-h-[2rem] focus:outline-none py-4',
      },
    },
  })

  const hasSetInitial = useRef(false)
  useEffect(() => {
    if (editor && initialContent && !hasSetInitial.current) {
      editor.commands.setContent(initialContent)
      hasSetInitial.current = true
    }
  }, [editor, initialContent])

  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor
      return () => {
        editorRef.current = null
      }
    }
  }, [editor, editorRef])

  if (!editor) return null

  return (
    <div>
      <div className="space-y-3">
        <EditorToolbar editor={editor} />
        {showVoiceCapture && (
          <VoiceCapture onTranscription={(text) => editor?.chain().focus().insertContent(text).run()} />
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
