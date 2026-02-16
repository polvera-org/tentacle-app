'use client'

import type { Editor } from '@tiptap/react'

interface EditorToolbarProps {
  editor: Editor
}

export function EditorToolbar({ editor }: EditorToolbarProps) {
  const buttons = [
    {
      label: 'B',
      title: 'Bold',
      command: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold'),
      className: 'font-bold',
    },
    {
      label: 'I',
      title: 'Italic',
      command: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic'),
      className: 'italic',
    },
    {
      label: 'H1',
      title: 'Heading 1',
      command: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      active: editor.isActive('heading', { level: 1 }),
    },
    {
      label: 'H2',
      title: 'Heading 2',
      command: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive('heading', { level: 2 }),
    },
    {
      label: 'H3',
      title: 'Heading 3',
      command: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      active: editor.isActive('heading', { level: 3 }),
    },
  ]

  const iconButtons = [
    {
      title: 'Bullet List',
      command: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList'),
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
        </svg>
      ),
    },
    {
      title: 'Ordered List',
      command: () => editor.chain().focus().toggleOrderedList().run(),
      active: editor.isActive('orderedList'),
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.242 5.992h12m-12 6.003h12m-12 5.999h12M4.117 7.495v-3.75H2.99m1.125 3.75H2.99m1.125 0H4.99m-3.873 3.75h.375c.621 0 1.125.504 1.125 1.125v.375c0 .621-.504 1.125-1.125 1.125h-.375m1.5-3.75h-.375a1.125 1.125 0 0 0-1.125 1.125v.375c0 .621.504 1.125 1.125 1.125h.375" />
        </svg>
      ),
    },
    {
      title: 'Code Block',
      command: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive('codeBlock'),
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
      ),
    },
    {
      title: 'Blockquote',
      command: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive('blockquote'),
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="flex items-center gap-1 py-2 border-b border-gray-200 sticky top-0 bg-white z-10 overflow-x-auto">
      {buttons.map((btn) => (
        <button
          key={btn.label}
          onClick={btn.command}
          title={btn.title}
          className={`min-w-[44px] h-[44px] px-3 rounded-full text-sm transition-all ${btn.className || ''} ${
            btn.active
              ? 'bg-brand-100 text-brand-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {btn.label}
        </button>
      ))}

      <div className="w-px h-6 bg-gray-200 mx-1" />

      {iconButtons.map((btn) => (
        <button
          key={btn.title}
          onClick={btn.command}
          title={btn.title}
          className={`min-w-[44px] h-[44px] px-3 rounded-full flex items-center justify-center transition-all ${
            btn.active
              ? 'bg-brand-100 text-brand-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {btn.icon}
        </button>
      ))}
    </div>
  )
}
