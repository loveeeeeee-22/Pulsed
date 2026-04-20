'use client'

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Image } from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Placeholder } from '@tiptap/extension-placeholder'

const FONT_COLORS = [
  { hex: '#F0EEE8', label: 'Default' },
  { hex: '#FFFFFF', label: 'White' },
  { hex: '#EF4444', label: 'Red' },
  { hex: '#F97316', label: 'Orange' },
  { hex: '#EAB308', label: 'Yellow' },
  { hex: '#22C55E', label: 'Green' },
  { hex: '#14B8A6', label: 'Teal' },
  { hex: '#3B82F6', label: 'Blue' },
  { hex: '#8B5CF6', label: 'Purple' },
  { hex: '#EC4899', label: 'Pink' },
  { hex: '#737373', label: 'Gray' },
  { hex: '#000000', label: 'Black' },
]

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function notesToHtml(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return '<p></p>'
  if (s.startsWith('<') && (s.includes('</p>') || s.includes('</li>') || s.includes('<br') || s.includes('<img') || s.includes('<ul') || s.includes('<ol'))) {
    return s
  }
  const blocks = s.split(/\n{2,}/)
  return blocks
    .map(block => {
      const inner = block.split('\n').map(line => escapeHtml(line)).join('<br>')
      return `<p>${inner}</p>`
    })
    .join('')
}

const RIBBON_TEXT = '#323130'
const RIBBON_SEP = '#d1d1d1'
const RIBBON_ACTIVE_BG = 'rgba(124, 58, 237, 0.18)'

function groupSep() {
  return <div style={{ width: '1px', height: '22px', background: RIBBON_SEP, margin: '0 6px', flexShrink: 0 }} aria-hidden />
}

function RibbonBtn({ onClick, active, disabled, title, children, width = 28 }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      style={{
        width,
        minWidth: width,
        height: '26px',
        border: '1px solid',
        borderColor: active ? '#7C3AED' : 'transparent',
        borderRadius: '3px',
        background: active ? RIBBON_ACTIVE_BG : 'transparent',
        color: RIBBON_TEXT,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

const TradeNotesRichEditor = forwardRef(function TradeNotesRichEditor(
  { tradeId, initialHtml, onHtmlChange, placeholder, minHeight = 160 },
  ref
) {
  const fileInputRef = useRef(null)
  const [colorOpen, setColorOpen] = useState(false)

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          bulletList: { HTMLAttributes: { class: 'tn-list' } },
          orderedList: { HTMLAttributes: { class: 'tn-list' } },
        }),
        TextStyleKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        Image.configure({
          allowBase64: true,
          inline: false,
          HTMLAttributes: { class: 'tn-img', style: 'max-width:100%;height:auto;border-radius:6px' },
        }),
        Placeholder.configure({ placeholder: placeholder || 'Type here…' }),
      ],
      content: notesToHtml(initialHtml),
      editorProps: {
        attributes: {
          class: 'trade-notes-prose',
          spellcheck: 'true',
        },
      },
      onUpdate: ({ editor: ed }) => {
        onHtmlChange?.(ed.getHTML())
      },
    },
    [tradeId]
  )

  useImperativeHandle(ref, () => ({
    focus: () => editor?.chain().focus().run(),
    getHtml: () => editor?.getHTML() ?? '',
    insertImage: (src) => {
      if (!editor || !src) return
      editor.chain().focus().setImage({ src }).run()
    },
  }))

  const insertImage = useCallback(
    e => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !file.type.startsWith('image/') || !editor) return
      if (file.size > 900_000) {
        window.alert('Image is too large. Please use a file under ~900KB, or compress it first.')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const src = String(reader.result || '')
        if (src) editor.chain().focus().setImage({ src }).run()
      }
      reader.readAsDataURL(file)
    },
    [editor]
  )

  if (!editor) {
    return (
      <div style={{ minHeight, borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: '12px' }}>
        Loading editor…
      </div>
    )
  }

  const ribbonBar = {
    background: '#ffffff',
    border: '1px solid #e1dfdd',
    borderBottom: 'none',
    borderRadius: '8px 8px 0 0',
    padding: '6px 8px',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '2px',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    boxShadow: 'inset 0 -1px 0 #e1dfdd',
  }

  return (
    <div className="trade-notes-rich-root">
      <div style={ribbonBar}>
        <span style={{ fontSize: '10px', color: '#605e5c', padding: '0 6px 0 2px', letterSpacing: '0.04em', fontWeight: 600 }}>Home</span>
        {groupSep()}

        <RibbonBtn title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <span style={{ fontWeight: 800, fontSize: '14px', fontFamily: 'Times New Roman, Times, serif', color: RIBBON_TEXT }}>B</span>
        </RibbonBtn>
        <RibbonBtn title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <span style={{ fontStyle: 'italic', fontSize: '15px', fontFamily: 'Times New Roman, Times, serif', color: RIBBON_TEXT }}>I</span>
        </RibbonBtn>
        <RibbonBtn title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <span style={{ fontSize: '14px', fontFamily: 'Times New Roman, Times, serif', textDecoration: 'underline', textUnderlineOffset: '2px', color: RIBBON_TEXT }}>U</span>
        </RibbonBtn>
        <RibbonBtn title="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <span style={{ fontSize: '13px', textDecoration: 'line-through', color: RIBBON_TEXT }}>abc</span>
        </RibbonBtn>

        {groupSep()}

        <div style={{ position: 'relative' }}>
          <RibbonBtn
            title="Font color"
            width={32}
            active={colorOpen}
            onClick={() => setColorOpen(v => !v)}
          >
            <span style={{ position: 'relative', fontSize: '15px', fontWeight: 700, fontFamily: 'Georgia, serif', color: RIBBON_TEXT }}>
              A
              <span
                style={{
                  position: 'absolute',
                  left: '1px',
                  right: '1px',
                  bottom: '-2px',
                  height: '3px',
                  background: editor.getAttributes('textStyle').color || '#c00000',
                  borderRadius: '1px',
                }}
              />
            </span>
          </RibbonBtn>
          {colorOpen ? (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 30,
                marginTop: '4px',
                padding: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '6px',
                background: '#ffffff',
                border: '1px solid #d1d1d1',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              }}
            >
              {FONT_COLORS.map(({ hex, label }) => (
                <button
                  key={hex}
                  type="button"
                  title={label}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(hex).run()
                    setColorOpen(false)
                  }}
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '3px',
                    border: '1px solid var(--border-md)',
                    background: hex,
                    cursor: 'pointer',
                  }}
                />
              ))}
              <button
                type="button"
                title="Automatic"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetColor().run()
                  setColorOpen(false)
                }}
                style={{ gridColumn: 'span 4', fontSize: '10px', color: '#323130', background: '#f3f2f1', border: '1px solid #d1d1d1', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}
              >
                Automatic (default)
              </button>
            </div>
          ) : null}
        </div>

        {groupSep()}

        <RibbonBtn title="Bullets" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden style={{ color: RIBBON_TEXT }}>
            <circle cx="2.5" cy="2.5" r="1.2" fill="currentColor" />
            <circle cx="2.5" cy="7" r="1.2" fill="currentColor" />
            <circle cx="2.5" cy="11.5" r="1.2" fill="currentColor" />
            <rect x="6" y="1.5" width="11" height="2" rx="0.5" fill="currentColor" opacity="0.9" />
            <rect x="6" y="6" width="11" height="2" rx="0.5" fill="currentColor" opacity="0.9" />
            <rect x="6" y="10.5" width="11" height="2" rx="0.5" fill="currentColor" opacity="0.9" />
          </svg>
        </RibbonBtn>
        <RibbonBtn title="Numbering" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'Segoe UI, sans-serif', letterSpacing: '-0.02em', color: RIBBON_TEXT }}>1.≡</span>
        </RibbonBtn>
        <RibbonBtn title="Checklist" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden style={{ color: RIBBON_TEXT }}>
            <rect x="1" y="1" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1" fill="none" />
            <path d="M2.2 3.2l0.8 0.8 1.4-1.6" stroke="currentColor" strokeWidth="0.8" fill="none" />
            <rect x="1" y="8" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1" fill="none" />
            <rect x="7" y="2" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
            <rect x="7" y="9" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.85" />
          </svg>
        </RibbonBtn>

        {groupSep()}

        <RibbonBtn
          title="Picture"
          width={34}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden style={{ color: RIBBON_TEXT }}>
            <rect x="1.5" y="2.5" width="17" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <circle cx="6" cy="7" r="1.8" fill="currentColor" opacity="0.7" />
            <path d="M2 12l4-4 3 3 4-5 5 6" stroke="currentColor" strokeWidth="1" fill="none" strokeLinejoin="round" />
          </svg>
        </RibbonBtn>
        <input
          ref={fileInputRef}
          id="trade-notes-image-upload"
          name="trade-notes-image-upload"
          type="file"
          accept="image/*"
          autoComplete="off"
          style={{ display: 'none' }}
          onChange={insertImage}
        />

        {groupSep()}

        <RibbonBtn title="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ color: RIBBON_TEXT }}>
            <path d="M4 6h6a4 4 0 1 1 0 8H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M4 6L7 3M4 6L7 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </RibbonBtn>
        <RibbonBtn title="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden style={{ color: RIBBON_TEXT }}>
            <path d="M12 6H6a4 4 0 1 0 0 8h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M12 6L9 3M12 6L9 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </RibbonBtn>

        {groupSep()}

        <RibbonBtn
          title="Clear formatting"
          width={30}
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <span style={{ fontSize: '12px', textDecoration: 'line-through', opacity: 0.85, color: RIBBON_TEXT }}>¶</span>
          <span style={{ fontSize: '9px', marginLeft: '1px', color: RIBBON_TEXT }}>x</span>
        </RibbonBtn>
      </div>

      <EditorContent
        editor={editor}
        style={{
          minHeight,
          border: '1px solid #e1dfdd',
          borderTop: '1px solid #e1dfdd',
          borderRadius: '0 0 8px 8px',
          background: 'var(--bg3)',
        }}
      />
    </div>
  )
})

export default TradeNotesRichEditor
