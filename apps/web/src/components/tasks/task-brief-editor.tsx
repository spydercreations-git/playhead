"use client";

import React, { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { Extension } from "@tiptap/core";
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
  Check,
} from "@/components/ui/icon";
import { sanitizeClientHTML } from "@/lib/sanitize";

interface TaskBriefEditorProps {
  initialContent?: string;
  onChange?: (html: string, json: any) => void;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

// Custom shortcut extension matching user specifications
const EditorShortcuts = Extension.create({
  name: "editorShortcuts",
  addKeyboardShortcuts() {
    return {
      "Mod-Alt-0": () => this.editor.commands.setParagraph(),
      "Mod-Alt-1": () => this.editor.commands.toggleHeading({ level: 1 }),
      "Mod-Alt-2": () => this.editor.commands.toggleHeading({ level: 2 }),
      "Mod-Alt-3": () => this.editor.commands.toggleHeading({ level: 3 }),
      "Mod-Shift-8": () => this.editor.commands.toggleBulletList(),
      "Mod-Shift-7": () => this.editor.commands.toggleOrderedList(),
      "Mod-Alt-c": () => this.editor.commands.toggleCodeBlock(),
      "Mod-b": () => this.editor.commands.toggleBold(),
      "Mod-i": () => this.editor.commands.toggleItalic(),
      "Mod-u": () => this.editor.commands.toggleUnderline(),
      "Mod-Shift-x": () => this.editor.commands.toggleStrike(),
      "Mod-Shift-h": () =>
        this.editor.commands.toggleHighlight({ color: "#ffd43b" }),
      "Mod-e": () => this.editor.commands.toggleCode(),
    };
  },
});

export function TaskBriefEditor({
  initialContent = "",
  onChange,
  readOnly = false,
  placeholder = "What do you need? Formats, length, references...",
  minHeight = "140px",
  className = "",
}: TaskBriefEditorProps) {
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkURL, setLinkURL] = useState("");
  const [, setSelectionTick] = useState(0);

  const styleMenuRef = useRef<HTMLDivElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);

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
          class: "text-[#4876F3] underline cursor-pointer",
        },
      }),
      EditorShortcuts,
    ],
    content: sanitizeClientHTML(initialContent || ""),
    editable: !readOnly,
    shouldRerenderOnTransaction: true,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "playhead-editor focus:outline-none px-4 py-3 text-white selection:bg-[#4876F3]/30",
        style: `min-height: ${minHeight};`,
      },
      handleKeyDown: (view, event) => {
        if (event.key === "/" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
          // Open slash menu after current character is processed
          setTimeout(() => {
            setSlashMenuOpen(true);
          }, 10);
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

  // Re-render toolbar synchronously on every transaction and selection update
  useEffect(() => {
    if (!editor) return;
    const onTick = () => setSelectionTick((c) => c + 1);
    editor.on("transaction", onTick);
    editor.on("selectionUpdate", onTick);
    return () => {
      editor.off("transaction", onTick);
      editor.off("selectionUpdate", onTick);
    };
  }, [editor]);

  // Sync external initialContent
  useEffect(() => {
    if (editor && initialContent !== undefined) {
      const safe = sanitizeClientHTML(initialContent || "");
      const isBothEmpty = (!safe || safe === "<p></p>") && editor.isEmpty;
      if (!isBothEmpty && editor.getHTML() !== safe && !editor.isFocused) {
        editor.commands.setContent(safe, { emitUpdate: false });
      }
    }
  }, [initialContent, editor]);

  // Click outside listener for dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        styleMenuRef.current &&
        !styleMenuRef.current.contains(event.target as Node)
      ) {
        setStyleMenuOpen(false);
      }
      if (
        slashMenuRef.current &&
        !slashMenuRef.current.contains(event.target as Node)
      ) {
        setSlashMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!editor) {
    return (
      <div className="w-full h-36 rounded-[10px] bg-[var(--input)]/40 border border-[var(--border)] animate-pulse" />
    );
  }

  // Active style detection
  const isH1 = editor.isActive("heading", { level: 1 });
  const isH2 = editor.isActive("heading", { level: 2 });
  const isH3 = editor.isActive("heading", { level: 3 });
  const isBulletList = editor.isActive("bulletList");
  const isOrderedList = editor.isActive("orderedList");
  const isCodeBlock = editor.isActive("codeBlock");
  const isBlockquote = editor.isActive("blockquote");

  const isBold = editor.isActive("bold");
  const isItalic = editor.isActive("italic");
  const isUnderline = editor.isActive("underline");
  const isStrike = editor.isActive("strike");
  const isHighlight = editor.isActive("highlight");
  const isCode = editor.isActive("code");
  const isLink = editor.isActive("link");

  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  function getCurrentStyleName(): string {
    if (isH1) return "Large heading";
    if (isH2) return "Medium heading";
    if (isH3) return "Small heading";
    if (isBulletList) return "Bulleted list";
    if (isOrderedList) return "Numbered list";
    if (isCodeBlock) return "Code block";
    return "Normal text";
  }

  // Applies block style, toggling back to Normal text if already active
  function applyBlockStyle(
    type: "normal" | "h1" | "h2" | "h3" | "bullet" | "ordered" | "code"
  ) {
    if (!editor) return;

    // If slash menu was open, clean up the triggering "/" character
    if (slashMenuOpen) {
      const { from } = editor.state.selection;
      const textBefore = editor.state.doc.textBetween(
        Math.max(0, from - 1),
        from
      );
      if (textBefore === "/") {
        editor.commands.deleteRange({ from: from - 1, to: from });
      }
    }

    if (type === "normal") {
      editor.chain().focus().setParagraph().run();
    } else if (type === "h1") {
      if (isH1) {
        editor.chain().focus().setParagraph().run();
      } else {
        editor.chain().focus().setHeading({ level: 1 }).run();
      }
    } else if (type === "h2") {
      if (isH2) {
        editor.chain().focus().setParagraph().run();
      } else {
        editor.chain().focus().setHeading({ level: 2 }).run();
      }
    } else if (type === "h3") {
      if (isH3) {
        editor.chain().focus().setParagraph().run();
      } else {
        editor.chain().focus().setHeading({ level: 3 }).run();
      }
    } else if (type === "bullet") {
      editor.chain().focus().toggleBulletList().run();
    } else if (type === "ordered") {
      editor.chain().focus().toggleOrderedList().run();
    } else if (type === "code") {
      editor.chain().focus().toggleCodeBlock().run();
    }

    setStyleMenuOpen(false);
    setSlashMenuOpen(false);
  }

  function handleSetLink() {
    if (!linkURL) {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkInputOpen(false);
      return;
    }
    const trimmed = linkURL.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      editor?.chain().focus().extendMarkRange("link").setLink({ href: `https://${trimmed}` }).run();
    } else {
      editor?.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    }
    setLinkURL("");
    setLinkInputOpen(false);
  }

  const activeBtnClass =
    "h-7 w-7 rounded-[6px] transition-colors flex items-center justify-center bg-[#4876F3]/15 text-[#4876F3] border border-[#4876F3]/30 cursor-pointer";
  const inactiveBtnClass =
    "h-7 w-7 rounded-[6px] transition-colors flex items-center justify-center text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white border border-transparent cursor-pointer";

  return (
    <div
      className={`w-full rounded-[12px] border border-[var(--border)] bg-[var(--panel)] overflow-hidden focus-within:border-[var(--border-strong)] transition-colors ${className}`}
    >
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--panel)] text-[var(--text-2)] relative select-none">
          {/* Insert / Plus */}
          <button
            type="button"
            title="Insert options"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setStyleMenuOpen((prev) => !prev)}
            className="h-7 w-7 rounded-[6px] hover:bg-[var(--hover)] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-transparent"
          >
            <Plus className="w-4 h-4" />
          </button>

          {/* Undo */}
          <button
            type="button"
            title="Undo (⌘Z)"
            disabled={!canUndo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (canUndo) editor.chain().focus().undo().run();
            }}
            className={`h-7 w-7 rounded-[6px] transition-colors flex items-center justify-center border border-transparent ${
              canUndo
                ? "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white cursor-pointer"
                : "text-[var(--text-3)] opacity-30 cursor-not-allowed"
            }`}
          >
            <Undo className="w-4 h-4" />
          </button>

          {/* Redo */}
          <button
            type="button"
            title="Redo (⌘⇧Z)"
            disabled={!canRedo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (canRedo) editor.chain().focus().redo().run();
            }}
            className={`h-7 w-7 rounded-[6px] transition-colors flex items-center justify-center border border-transparent ${
              canRedo
                ? "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white cursor-pointer"
                : "text-[var(--text-3)] opacity-30 cursor-not-allowed"
            }`}
          >
            <Redo className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-[var(--border)] mx-1" />

          {/* Text Style Menu Dropdown */}
          <div className="relative" ref={styleMenuRef}>
            <button
              type="button"
              title="Text style"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setStyleMenuOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-2 py-1 h-7 rounded-[6px] text-[13px] font-medium text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-colors cursor-pointer border border-transparent"
            >
              <span className="font-semibold text-[13px]">Tt</span>
              <span className="text-[13px] text-white font-medium">
                {getCurrentStyleName()}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)]" />
            </button>

            {styleMenuOpen && (
              <div className="absolute top-full left-0 mt-1 w-60 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1 text-[12px] font-medium text-[var(--text-3)]">
                  Turn into
                </div>

                {/* Normal text */}
                <button
                  type="button"
                  data-style-option="normal"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyBlockStyle("normal")}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                    !isH1 && !isH2 && !isH3 && !isBulletList && !isOrderedList && !isCodeBlock
                      ? "bg-[#4876F3]/15 text-[#4876F3] font-semibold"
                      : "text-white hover:bg-[var(--hover)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-[13px]">Tt</span>
                    <span>Normal text</span>
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥0</span>
                </button>

                {/* Large heading */}
                <button
                  type="button"
                  data-style-option="h1"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyBlockStyle("h1")}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                    isH1
                      ? "bg-[#4876F3]/15 text-[#4876F3] font-semibold"
                      : "text-white hover:bg-[var(--hover)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-[14px]">H1</span>
                    <span className="font-semibold">Large heading</span>
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥1</span>
                </button>

                {/* Medium heading */}
                <button
                  type="button"
                  data-style-option="h2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyBlockStyle("h2")}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                    isH2
                      ? "bg-[#4876F3]/15 text-[#4876F3] font-semibold"
                      : "text-white hover:bg-[var(--hover)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-[13px]">H2</span>
                    <span>Medium heading</span>
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥2</span>
                </button>

                {/* Small heading */}
                <button
                  type="button"
                  data-style-option="h3"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyBlockStyle("h3")}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                    isH3
                      ? "bg-[#4876F3]/15 text-[#4876F3] font-semibold"
                      : "text-white hover:bg-[var(--hover)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-[13px]">H3</span>
                    <span>Small heading</span>
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⌥3</span>
                </button>

                <div className="h-px bg-[var(--border)] my-1" />

                {/* Bulleted list */}
                <button
                  type="button"
                  data-style-option="bullet"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyBlockStyle("bullet")}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                    isBulletList
                      ? "bg-[#4876F3]/15 text-[#4876F3] font-semibold"
                      : "text-white hover:bg-[var(--hover)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-bold text-[13px]">•</span>
                    <span>Bulleted list</span>
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⇧8</span>
                </button>

                {/* Numbered list */}
                <button
                  type="button"
                  data-style-option="ordered"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyBlockStyle("ordered")}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                    isOrderedList
                      ? "bg-[#4876F3]/15 text-[#4876F3] font-semibold"
                      : "text-white hover:bg-[var(--hover)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-[12px]">1.</span>
                    <span>Numbered list</span>
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">⌘⇧7</span>
                </button>

                {/* Code block */}
                <button
                  type="button"
                  data-style-option="code"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyBlockStyle("code")}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                    isCodeBlock
                      ? "bg-[#4876F3]/15 text-[#4876F3] font-semibold"
                      : "text-white hover:bg-[var(--hover)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[12px]">&lt;/&gt;</span>
                    <span>Code block</span>
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
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={isBold ? activeBtnClass : inactiveBtnClass}
          >
            <Bold className="w-4 h-4" />
          </button>

          {/* Italic */}
          <button
            type="button"
            title="Italic (⌘I)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={isItalic ? activeBtnClass : inactiveBtnClass}
          >
            <Italic className="w-4 h-4" />
          </button>

          {/* Underline */}
          <button
            type="button"
            title="Underline (⌘U)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={isUnderline ? activeBtnClass : inactiveBtnClass}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>

          {/* Strikethrough */}
          <button
            type="button"
            title="Strikethrough (⌘⇧X)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={isStrike ? activeBtnClass : inactiveBtnClass}
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          {/* Link */}
          <div className="relative">
            <button
              type="button"
              title="Add link (⌘K)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (isLink) {
                  editor.chain().focus().unsetLink().run();
                } else {
                  setLinkInputOpen((prev) => !prev);
                }
              }}
              className={isLink ? activeBtnClass : inactiveBtnClass}
            >
              <LinkIcon className="w-4 h-4" />
            </button>

            {linkInputOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 p-2 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl z-50 flex items-center gap-1.5 animate-in fade-in duration-100">
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
                  className="flex-1 bg-[var(--input)] border border-[var(--border)] rounded-[6px] px-2 py-1 text-[13px] text-white focus:outline-none focus:border-[#4876F3]"
                />
                <button
                  type="button"
                  onClick={handleSetLink}
                  className="px-2.5 py-1 bg-[#4876F3] text-white text-[13px] font-medium rounded-[6px] cursor-pointer"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* Highlight */}
          <button
            type="button"
            title="Highlight (⌘⇧H)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              editor.chain().focus().toggleHighlight({ color: "#ffd43b" }).run()
            }
            className={isHighlight ? activeBtnClass : inactiveBtnClass}
          >
            <Highlighter className="w-4 h-4" />
          </button>

          {/* Inline Code */}
          <button
            type="button"
            title="Inline code (⌘E)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={isCode ? activeBtnClass : inactiveBtnClass}
          >
            <Code className="w-4 h-4" />
          </button>

          {/* Quote */}
          <button
            type="button"
            title="Quote"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={isBlockquote ? activeBtnClass : inactiveBtnClass}
          >
            <Quote className="w-4 h-4" />
          </button>

          {/* Divider line */}
          <button
            type="button"
            title="Divider line"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="h-7 w-7 rounded-[6px] hover:bg-[var(--hover)] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-transparent"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="relative">
        <EditorContent editor={editor} />

        {editor.isEmpty && (
          <div className="absolute top-3.5 left-4 text-[15px] leading-[24px] text-[var(--text-3)] pointer-events-none select-none">
            {placeholder}
          </div>
        )}

        {/* Slash Menu ("/" popup) */}
        {slashMenuOpen && !readOnly && (
          <div
            ref={slashMenuRef}
            className="absolute top-8 left-4 w-60 rounded-[8px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-1 text-[12px] font-medium text-[var(--text-3)]">
              Turn into
            </div>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockStyle("normal")}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="font-semibold text-[13px]">Tt</span>
                <span>Normal text</span>
              </span>
              <span className="text-[12px] text-[var(--text-3)]">⌘⌥0</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockStyle("h1")}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="font-bold text-[14px]">H1</span>
                <span>Large heading</span>
              </span>
              <span className="text-[12px] text-[var(--text-3)]">⌘⌥1</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockStyle("h2")}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="font-semibold text-[13px]">H2</span>
                <span>Medium heading</span>
              </span>
              <span className="text-[12px] text-[var(--text-3)]">⌘⌥2</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockStyle("h3")}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="font-semibold text-[13px]">H3</span>
                <span>Small heading</span>
              </span>
              <span className="text-[12px] text-[var(--text-3)]">⌘⌥3</span>
            </button>

            <div className="h-px bg-[var(--border)] my-1" />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockStyle("bullet")}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="font-bold text-[13px]">•</span>
                <span>Bulleted list</span>
              </span>
              <span className="text-[12px] text-[var(--text-3)]">⌘⇧8</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockStyle("ordered")}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="font-semibold text-[12px]">1.</span>
                <span>Numbered list</span>
              </span>
              <span className="text-[12px] text-[var(--text-3)]">⌘⇧7</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockStyle("code")}
              className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-white hover:bg-[var(--hover)] transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[12px]">&lt;/&gt;</span>
                <span>Code block</span>
              </span>
              <span className="text-[12px] text-[var(--text-3)]">⌘⌥C</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
