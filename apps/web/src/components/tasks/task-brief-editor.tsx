"use client";

import React, { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import {
  Undo,
  Redo,
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  Link as LinkIcon,
  Highlighter,
  Code,
  Quote,
  Minus,
  Plus,
  ChevronDown,
} from "@/components/ui/icon";
import { sanitizeClientHTML } from "@/lib/sanitize";

interface TaskBriefEditorProps {
  initialContent?: string;
  onChange?: (html: string, json: any) => void;
  readOnly?: boolean;
  placeholder?: string;
}

export function TaskBriefEditor({
  initialContent = "",
  onChange,
  readOnly = false,
  placeholder = "Describe what you need: formats, length, references...",
}: TaskBriefEditorProps) {
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkURL, setLinkURL] = useState("");
  const styleMenuRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {},
      }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-[var(--primary)] underline cursor-pointer",
        },
      }),
    ],
    content: sanitizeClientHTML(initialContent || ""),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[140px] px-3.5 py-3 text-sm text-[var(--text)] leading-relaxed selection:bg-[var(--primary)]/30",
      },
      handleKeyDown: (view, event) => {
        if (event.key === "/" && !event.shiftKey) {
          setSlashMenuOpen(true);
        } else if (event.key === "Escape") {
          setSlashMenuOpen(false);
          setStyleMenuOpen(false);
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(editor.getHTML(), editor.getJSON());
      }
    },
  });

  useEffect(() => {
    if (editor && initialContent !== undefined) {
      const safe = sanitizeClientHTML(initialContent || "");
      if (editor.getHTML() !== safe && !editor.isFocused) {
        editor.commands.setContent(safe);
      }
    }
  }, [initialContent, editor]);

  // Click outside listener for style dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (styleMenuRef.current && !styleMenuRef.current.contains(event.target as Node)) {
        setStyleMenuOpen(false);
        setSlashMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!editor) {
    return (
      <div className="w-full h-36 rounded-[8px] bg-[var(--input)]/40 border border-[var(--border)] animate-pulse" />
    );
  }

  function getCurrentStyleName(): string {
    if (!editor) return "Normal text";
    if (editor.isActive("heading", { level: 1 })) return "Large heading";
    if (editor.isActive("heading", { level: 2 })) return "Medium heading";
    if (editor.isActive("heading", { level: 3 })) return "Small heading";
    if (editor.isActive("bulletList")) return "Bulleted list";
    if (editor.isActive("orderedList")) return "Numbered list";
    if (editor.isActive("codeBlock")) return "Code block";
    return "Normal text";
  }

  function handleSetLink() {
    if (!linkURL) {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkInputOpen(false);
      return;
    }
    // Block dangerous javascript: and data: links
    const trimmed = linkURL.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      editor?.chain().focus().extendMarkRange("link").setLink({ href: `https://${trimmed}` }).run();
    } else {
      editor?.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    }
    setLinkURL("");
    setLinkInputOpen(false);
  }

  return (
    <div className="w-full rounded-[8px] border border-[var(--border)] bg-[var(--panel)]/60 overflow-hidden focus-within:border-[var(--border-strong)] transition-colors">
      {/* Toolbar from T2 */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--panel)] text-[var(--text-2)] relative">
          {/* Insert / Plus */}
          <button
            type="button"
            title="Insert options"
            onClick={() => setStyleMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-[6px] hover:bg-[var(--hover)] hover:text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Undo */}
          <button
            type="button"
            title="Undo (⌘Z)"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1.5 rounded-[6px] hover:bg-[var(--hover)] hover:text-white disabled:opacity-40 transition-colors"
          >
            <Undo className="w-4 h-4" />
          </button>

          {/* Redo */}
          <button
            type="button"
            title="Redo (⌘⇧Z)"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1.5 rounded-[6px] hover:bg-[var(--hover)] hover:text-white disabled:opacity-40 transition-colors"
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-[var(--border)] mx-1" />

          {/* Text Style Menu Dropdown */}
          <div className="relative" ref={styleMenuRef}>
            <button
              type="button"
              title="Text style"
              onClick={() => setStyleMenuOpen((prev) => !prev)}
              className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-xs font-medium hover:bg-[var(--hover)] hover:text-white transition-colors"
            >
              <span>{getCurrentStyleName()}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)]" />
            </button>

            {styleMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-overlay py-1.5 z-50">
                <div className="px-3 py-1 text-[12px] font-medium text-[var(--text-3)]">
                  Turn into
                </div>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().setParagraph().run();
                    setStyleMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">Tt</span> Normal text
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥0</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().toggleHeading({ level: 1 }).run();
                    setStyleMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2 font-bold text-sm">
                    <span>T</span> Large heading
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥1</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().toggleHeading({ level: 2 }).run();
                    setStyleMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <span>T</span> Medium heading
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥2</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().toggleHeading({ level: 3 }).run();
                    setStyleMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>T</span> Small heading
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥3</span>
                </button>
                <div className="h-px bg-[var(--border)] my-1" />
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().toggleBulletList().run();
                    setStyleMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>•</span> Bulleted list
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⇧8</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().toggleOrderedList().run();
                    setStyleMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>1.</span> Numbered list
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⇧7</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    editor.chain().focus().toggleCodeBlock().run();
                    setStyleMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>&lt;&gt;</span> Code block
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥C</span>
                </button>
              </div>
            )}
          </div>

          <div className="w-px h-4 bg-[var(--border)] mx-1" />

          {/* Bold */}
          <button
            type="button"
            title="Bold (⌘B)"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded-[6px] transition-colors ${
              editor.isActive("bold")
                ? "bg-[var(--hover)] text-white"
                : "hover:bg-[var(--hover)] hover:text-white"
            }`}
          >
            <Bold className="w-4 h-4" />
          </button>

          {/* Italic */}
          <button
            type="button"
            title="Italic (⌘I)"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded-[6px] transition-colors ${
              editor.isActive("italic")
                ? "bg-[var(--hover)] text-white"
                : "hover:bg-[var(--hover)] hover:text-white"
            }`}
          >
            <Italic className="w-4 h-4" />
          </button>

          {/* Underline */}
          <button
            type="button"
            title="Underline (⌘U)"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded-[6px] transition-colors ${
              editor.isActive("underline")
                ? "bg-[var(--hover)] text-white"
                : "hover:bg-[var(--hover)] hover:text-white"
            }`}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>

          {/* Strikethrough */}
          <button
            type="button"
            title="Strikethrough (⌘⇧X)"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded-[6px] transition-colors ${
              editor.isActive("strike")
                ? "bg-[var(--hover)] text-white"
                : "hover:bg-[var(--hover)] hover:text-white"
            }`}
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          {/* Link */}
          <div className="relative">
            <button
              type="button"
              title="Add link (⌘K)"
              onClick={() => {
                if (editor.isActive("link")) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  setLinkInputOpen((prev) => !prev);
                }
              }}
              className={`p-1.5 rounded-[6px] transition-colors ${
                editor.isActive("link")
                  ? "bg-[var(--hover)] text-white"
                  : "hover:bg-[var(--hover)] hover:text-white"
              }`}
            >
              <LinkIcon className="w-4 h-4" />
            </button>

            {linkInputOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 p-2 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl z-50 flex items-center gap-1.5">
                <input
                  type="url"
                  placeholder="Paste URL..."
                  value={linkURL}
                  onChange={(e) => setLinkURL(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSetLink();
                    } else if (e.key === "Escape") {
                      setLinkInputOpen(false);
                    }
                  }}
                  autoFocus
                  className="flex-1 bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2 py-1 text-xs text-white focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  type="button"
                  onClick={handleSetLink}
                  className="px-2.5 py-1 bg-[var(--primary)] text-white text-xs font-medium rounded-[6px]"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* Highlight */}
          <button
            type="button"
            title="Highlight (⇧⌘H)"
            onClick={() => editor.chain().focus().toggleHighlight({ color: "#ffd43b" }).run()}
            className={`p-1.5 rounded-[6px] transition-colors ${
              editor.isActive("highlight")
                ? "bg-[var(--hover)] text-white"
                : "hover:bg-[var(--hover)] hover:text-white"
            }`}
          >
            <Highlighter className="w-4 h-4" />
          </button>

          {/* Inline Code */}
          <button
            type="button"
            title="Inline code (⌘E)"
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`p-1.5 rounded-[6px] transition-colors ${
              editor.isActive("code")
                ? "bg-[var(--hover)] text-white"
                : "hover:bg-[var(--hover)] hover:text-white"
            }`}
          >
            <Code className="w-4 h-4" />
          </button>

          {/* Quote */}
          <button
            type="button"
            title="Quote"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded-[6px] transition-colors ${
              editor.isActive("blockquote")
                ? "bg-[var(--hover)] text-white"
                : "hover:bg-[var(--hover)] hover:text-white"
            }`}
          >
            <Quote className="w-4 h-4" />
          </button>

          {/* Divider */}
          <button
            type="button"
            title="Divider line"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="p-1.5 rounded-[6px] hover:bg-[var(--hover)] hover:text-white transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="relative">
        <EditorContent editor={editor} />
        {editor.isEmpty && (
          <div className="absolute top-3 left-3.5 text-xs text-[var(--text-3)] pointer-events-none select-none">
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
