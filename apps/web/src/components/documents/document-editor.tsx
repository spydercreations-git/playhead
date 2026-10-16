"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import LinkExtension from "@tiptap/extension-link";
import CharacterCount from "@tiptap/extension-character-count";
import Collaboration from "@tiptap/extension-collaboration";
import { Extension } from "@tiptap/core";
import { yCursorPlugin } from "@tiptap/y-tiptap";

const PlayheadCollabCursor = Extension.create({
  name: "collaborationCursor",
  priority: 999,
  addOptions() {
    return {
      provider: null as any,
      user: {
        name: "Collaborator",
        color: "#3b82f6",
      },
      render: (user: any) => {
        const cursor = document.createElement("span");
        cursor.classList.add("collaboration-cursor__caret");
        cursor.setAttribute("style", `border-color: ${user.color}`);

        const label = document.createElement("div");
        label.classList.add("collaboration-cursor__label");
        label.setAttribute("style", `background-color: ${user.color}`);
        label.insertBefore(document.createTextNode(user.name || "Collaborator"), null);
        cursor.insertBefore(label, null);

        return cursor;
      },
    };
  },
  addProseMirrorPlugins() {
    if (!this.options.provider || !this.options.provider.awareness) {
      return [];
    }
    this.options.provider.awareness.setLocalStateField("user", this.options.user);
    return [
      yCursorPlugin(
        this.options.provider.awareness,
        {
          cursorBuilder: this.options.render,
        } as any
      ),
    ];
  },
});

import {
  ArrowLeft,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Table as TableIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Image as ImageIcon,
  Film,
  Lock,
  Download,
  History,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  FileCode,
  Printer,
  Maximize2,
  Minimize2,
  Sun,
  Moon,
  Loader2,
  Upload,
} from "@/components/ui/icon";

import { TeamNotes } from "./nodes/team-notes";
import { PlayheadVideoCard } from "./nodes/video-card";
import { ResizableImage } from "./nodes/resizable-image";
import { useCollabDocument, SyncStatus } from "./use-collab-document";
import {
  VersionHistoryDrawer,
  DocumentVersionItem,
} from "./version-history-drawer";
import { toast } from "@/lib/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiRequest } from "@/lib/api";
import { PdfExportDialog } from "@/components/export/pdf-export-dialog";
import TurndownService from "turndown";
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

export interface DocumentEditorProps {
  documentId: string;
  initialTitle: string;
  projectId?: string;
  projectName?: string;
  isTeamMember: boolean;
  canEdit: boolean;
  initialContentJson?: any;
}

interface OutlineItem {
  id: string;
  text: string;
  level: number;
  pos: number;
}

interface ReadOnlyVersionPreviewProps {
  contentJson: any;
}

function ReadOnlyVersionPreview({ contentJson }: ReadOnlyVersionPreviewProps) {
  const previewExtensions = useMemo(
    () => [
      StarterKit.configure({
        undoRedo: false,
        dropcursor: false,
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      LinkExtension.configure({ openOnClick: false }),
      CharacterCount,
      TeamNotes,
      PlayheadVideoCard,
      ResizableImage,
    ],
    []
  );

  const previewEditor = useEditor(
    {
      extensions: previewExtensions,
      editable: false,
      content: contentJson || {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
      editorProps: {
        attributes: {
          class:
            "prose dark:prose-invert max-w-none focus:outline-none min-h-[600px] text-foreground leading-relaxed select-text",
        },
      },
    },
    [contentJson]
  );

  return <EditorContent editor={previewEditor} />;
}

export function DocumentEditor({
  documentId,
  initialTitle,
  projectId,
  projectName,
  isTeamMember,
  canEdit,
  initialContentJson,
}: DocumentEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Document Title state & debounce save
  const [title, setTitle] = useState(initialTitle || "Untitled Document");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select title when document is newly created per Part C spec
  useEffect(() => {
    const isNew = searchParams?.get("new") === "1" || initialTitle === "Untitled Document";
    if (isNew && canEdit) {
      setTimeout(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      }, 150);
    }
  }, [searchParams, initialTitle, canEdit]);

  // Layout view options
  const [isCanvasMode, setIsCanvasMode] = useState(false); // false = 816px Letter page; true = 100% full width
  const [isDarkPage, setIsDarkPage] = useState(true); // page background: white vs dark canvas
  const [showOutline, setShowOutline] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPdfExportDialog, setShowPdfExportDialog] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [insertVideoModalOpen, setInsertVideoModalOpen] = useState(false);
  const [videoItemIdInput, setVideoItemIdInput] = useState("");

  // Version History State
  const [versions, setVersions] = useState<DocumentVersionItem[]>([]);
  const [selectedHistoricalVersion, setSelectedHistoricalVersion] =
    useState<DocumentVersionItem | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);

  async function handleRestoreHistoricalVersion() {
    if (!selectedHistoricalVersion) return;
    try {
      setIsRestoringVersion(true);
      await apiRequest(`/documents/${documentId}/restore`, {
        method: "POST",
        body: JSON.stringify({ version_id: selectedHistoricalVersion.id }),
      });
      toast.success(`Restored "${selectedHistoricalVersion.name || "version"}"`);
      setSelectedHistoricalVersion(null);
      setShowRestoreConfirm(false);
      apiRequest<{ versions: DocumentVersionItem[] }>(
        `/documents/${documentId}/versions`
      ).then((res) => {
        if (res?.versions) setVersions(res.versions);
      });
    } catch (err: any) {
      console.error("Failed to restore version", err);
      toast.error("Failed to restore version");
    } finally {
      setIsRestoringVersion(false);
    }
  }

  // Find & replace state
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matchCount, setMatchCount] = useState(0);

  // Setup collaboration hook
  const {
    ydoc,
    provider,
    syncStatus,
    setSyncStatus,
    activeUsers,
    userColor,
    isOffline,
  } = useCollabDocument({
    documentId,
    isTeamMember,
    canEdit,
    initialContentJson,
  });

  // Load versions
  useEffect(() => {
    if (!documentId) return;
    async function fetchVersions() {
      try {
        const res = await apiRequest<{ versions: DocumentVersionItem[] }>(
          `/documents/${documentId}/versions`
        );
        if (res && res.versions) {
          setVersions(res.versions);
        }
      } catch (e) {
        console.warn("Failed to load versions", e);
      }
    }
    fetchVersions();
  }, [documentId]);

  // Non-team Polling (Decision 1 & User Approved Change 1)
  // Non-team users poll GET /api/v1/documents/{id}/view every 10s for updates
  useEffect(() => {
    if (isTeamMember) return;
    const interval = setInterval(async () => {
      try {
        const viewData = await apiRequest<{ content_json: any }>(
          `/documents/${documentId}/view`
        );
        if (viewData?.content_json && editor && !editor.isDestroyed) {
          editor.commands.setContent(viewData.content_json);
        }
      } catch (err) {
        console.warn("Polling sanitized view failed", err);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isTeamMember, documentId]);

  // Build Tiptap extensions
  const extensions = useMemo(() => {
    const list: any[] = [
      StarterKit.configure({
        undoRedo: isTeamMember && provider ? false : {}, // Yjs handles history when collab is active
        dropcursor: { color: "#3b82f6", width: 2 },
      }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      LinkExtension.configure({ openOnClick: false }),
      CharacterCount,
      TeamNotes,
      PlayheadVideoCard,
      ResizableImage,
    ];

    // Connect Yjs Collaboration ONLY for team members
    if (isTeamMember && provider) {
      list.push(
        Collaboration.configure({
          document: ydoc,
        })
      );
      list.push(
        PlayheadCollabCursor.configure({
          provider: provider,
          user: {
            name: "Collaborator",
            color: userColor,
          },
        })
      );
    }

    return list;
  }, [isTeamMember, provider, ydoc, userColor]);

  // Word import loading state
  const [isImportingDocx, setIsImportingDocx] = useState(false);

  // Editor instance
  // 1. Initial content: With Collaboration extension, content must NOT be used
  const editor = useEditor(
    {
      extensions,
      editable: canEdit && !selectedHistoricalVersion,
      content:
        isTeamMember && provider
          ? undefined
          : initialContentJson || {
              type: "doc",
              content: [{ type: "paragraph" }],
            },
      editorProps: {
        attributes: {
          class:
            "prose dark:prose-invert max-w-none focus:outline-none min-h-[600px] text-foreground leading-relaxed",
        },
      },
      onUpdate() {
        if (isTeamMember) {
          setSyncStatus("saving");
        }
      },
    },
    [extensions, canEdit]
  );

  // 2. Version preview: Never call setContent on live collaborative editor.
  // Toggle live editor editable state when historical preview is active.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(canEdit && !selectedHistoricalVersion);
  }, [selectedHistoricalVersion, editor, canEdit]);

  // Handle title rename debounce
  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    if (!canEdit) return;
    setIsSavingTitle(true);
  }

  useEffect(() => {
    if (!isSavingTitle) return;
    const timer = setTimeout(async () => {
      try {
        await apiRequest(`/documents/${documentId}/title`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        });
      } catch (err) {
        console.warn("Failed to rename document title", err);
      } finally {
        setIsSavingTitle(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, isSavingTitle, documentId]);

  // Extract headings for Table of Contents outline
  const outlineItems: OutlineItem[] = useMemo(() => {
    if (!editor) return [];
    const items: OutlineItem[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "heading") {
        const text = node.textContent;
        const level = node.attrs.level || 1;
        if (text.trim()) {
          items.push({
            id: `heading-${pos}`,
            text,
            level,
            pos,
          });
        }
      }
    });
    return items;
  }, [editor?.state?.doc]);

  function jumpToHeading(pos: number) {
    if (!editor) return;
    editor.commands.setTextSelection(pos);
    const domNode = editor.view.nodeDOM(pos) as HTMLElement;
    if (domNode) {
      domNode.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Handle image upload with presigned S3 URL
  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    try {
      setSyncStatus("saving");
      // Check if current selection is inside a team note
      const isInsideTeamNote = editor.isActive("team_notes");

      // 1. Get presigned upload URL from API
      const presign = await apiRequest<{
        asset_id: string;
        storage_key: string;
        upload_url: string;
      }>(`/documents/${documentId}/images/presign`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          mime: file.type || "image/png",
          size_bytes: file.size,
          in_team_notes: isInsideTeamNote,
        }),
      });

      // 2. Direct upload to S3/R2 presigned URL
      const uploadRes = await fetch(presign.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "image/png",
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error("Failed to upload image bytes to storage");
      }

      // 3. Complete asset registration in API
      await apiRequest(`/documents/${documentId}/images/complete`, {
        method: "POST",
        body: JSON.stringify({
          asset_id: presign.asset_id,
          in_team_notes: isInsideTeamNote,
        }),
      });

      // 4. Insert image node with permanent document image URL
      const imageUrl = `/api/v1/documents/${documentId}/images/${presign.asset_id}`;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "resizableImage",
          attrs: {
            src: imageUrl,
            alt: file.name,
            assetId: presign.asset_id,
            inTeamNotes: isInsideTeamNote,
          },
        })
        .run();

      setSyncStatus("saved");
    } catch (err: any) {
      console.error("Image upload failed", err);
      toast.error(err.message || "Failed to upload image. Please check storage quota.");
      setSyncStatus("saved");
    } finally {
      e.target.value = "";
    }
  }

  // Handle Video Card insertion
  function handleInsertVideo() {
    if (!videoItemIdInput.trim() || !editor) return;
    const cleanId = videoItemIdInput.trim().split("/").pop() || "";
    editor
      .chain()
      .focus()
      .insertContent({
        type: "playheadVideoCard",
        attrs: {
          itemId: cleanId,
          documentId: documentId,
        },
      })
      .run();

    setVideoItemIdInput("");
    setInsertVideoModalOpen(false);
  }

  // Export handlers
  function exportMarkdown() {
    if (!editor) return;
    const html = editor.getHTML();
    const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
    const md = turndown.turndown(html);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  function exportPlainText() {
    if (!editor) return;
    const text = editor.getText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  async function exportDocx() {
    if (!editor) return;
    try {
      // Build docx structure from text & headings
      const paragraphs: Paragraph[] = [
        new Paragraph({
          text: title,
          heading: HeadingLevel.TITLE,
        }),
      ];

      editor.state.doc.descendants((node) => {
        if (node.type.name === "heading") {
          const lvl =
            node.attrs.level === 1
              ? HeadingLevel.HEADING_1
              : node.attrs.level === 2
              ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3;
          paragraphs.push(
            new Paragraph({
              text: node.textContent,
              heading: lvl,
            })
          );
        } else if (node.type.name === "paragraph") {
          if (node.textContent.trim()) {
            paragraphs.push(
              new Paragraph({
                children: [new TextRun(node.textContent)],
              })
            );
          }
        }
      });

      const doc = new DocxDocument({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.toLowerCase().replace(/\s+/g, "_")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Docx export error", e);
      toast.error("Failed to export Word document");
    } finally {
      setShowExportMenu(false);
    }
  }

  function exportPDF() {
    setShowExportMenu(false);
    setShowPdfExportDialog(true);
  }

  // 7. Word import: converts .docx on the server side via collab service with 25MB limit
  async function handleImportDocx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.size > 25 * 1024 * 1024) {
      toast.error("Word document exceeds 25MB limit.");
      return;
    }

    try {
      setIsImportingDocx(true);
      const formData = new FormData();
      formData.append("file", file);

      await apiRequest(`/documents/${documentId}/import-docx`, {
        method: "POST",
        body: formData,
      });

      // Re-fetch versions
      apiRequest<{ versions: DocumentVersionItem[] }>(
        `/documents/${documentId}/versions`
      ).then((vRes) => {
        if (vRes?.versions) setVersions(vRes.versions);
      });
      toast.success("Word document imported successfully");
    } catch (err: any) {
      console.error("Failed to import Word document:", err);
      toast.error(err.message || "Failed to import Word document.");
    } finally {
      setIsImportingDocx(false);
    }
  }

  // Word & character stats
  const words = editor?.storage?.characterCount?.words?.() || 0;
  const characters = editor?.storage?.characterCount?.characters?.() || 0;
  const readTimeMin = Math.max(1, Math.ceil(words / 200));

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden select-text">
      {/* ------------------------------------------------------------- */}
      {/* 1. Top Navigation Bar                                         */}
      {/* ------------------------------------------------------------- */}
      <header className="h-14 border-b border-border bg-card/80 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={projectId ? `/projects/${projectId}` : "/documents"}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          {/* Document Title Editable In-Place */}
          <div className="flex items-center gap-2 min-w-0">
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              disabled={!canEdit || Boolean(selectedHistoricalVersion)}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="bg-transparent text-sm sm:text-base font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded px-1.5 py-0.5 truncate max-w-[200px] sm:max-w-[340px]"
            />
            {isSavingTitle && (
              <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin shrink-0" />
            )}
          </div>

          {/* Sync Status Badge (Strict Rule: Zero emojis, explicit colors & words) */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-border/60 bg-muted/30 shrink-0">
            {syncStatus === "saved" && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-muted-foreground">Saved</span>
              </>
            )}
            {syncStatus === "saving" && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <span className="text-amber-400">Saving...</span>
              </>
            )}
            {syncStatus === "offline" && (
              <>
                <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                <span className="text-muted-foreground">
                  Offline: changes saved on this device
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Active Presence Avatars */}
          {activeUsers.length > 0 && (
            <div className="flex items-center -space-x-1.5 mr-2">
              {activeUsers.slice(0, 4).map((u, i) => (
                <div
                  key={i}
                  className="w-7 h-7 rounded-full border-2 border-card bg-muted text-xs font-semibold flex items-center justify-center text-foreground  shadow-sm"
                  style={{ borderColor: u.color }}
                  title={u.name}
                >
                  {u.name.slice(0, 2)}
                </div>
              ))}
              {activeUsers.length > 4 && (
                <div className="w-7 h-7 rounded-full border-2 border-card bg-muted text-xs font-semibold flex items-center justify-center text-muted-foreground">
                  +{activeUsers.length - 4}
                </div>
              )}
            </div>
          )}

          {/* Outline Button */}
          <button
            type="button"
            onClick={() => setShowOutline(!showOutline)}
            className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${
              showOutline ? "bg-muted text-primary" : ""
            }`}
            title="Document outline"
          >
            <List className="w-4 h-4" />
          </button>

          {/* Find & Replace Button */}
          <button
            type="button"
            onClick={() => setShowFindReplace(!showFindReplace)}
            className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${
              showFindReplace ? "bg-muted text-primary" : ""
            }`}
            title="Find & replace"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Page vs Canvas View Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsCanvasMode(!isCanvasMode)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={isCanvasMode ? "Switch to page view" : "Switch to canvas full width"}
          >
            {isCanvasMode ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          {/* Dark Page Toggle */}
          <button
            type="button"
            onClick={() => setIsDarkPage(!isDarkPage)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={isDarkPage ? "White paper background" : "Dark canvas background"}
          >
            {isDarkPage ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Version History Toggle */}
          <button
            type="button"
            onClick={() => setShowVersions(!showVersions)}
            className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${
              showVersions || selectedHistoricalVersion ? "bg-muted text-primary" : ""
            }`}
            title="Version history"
          >
            <History className="w-4 h-4" />
          </button>

          {/* Import .docx Button */}
          {canEdit && !selectedHistoricalVersion && (
            <label className="px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors flex items-center gap-1.5 cursor-pointer">
              {isImportingDocx ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              <span>{isImportingDocx ? "Importing..." : "Import .docx"}</span>
              <input
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={isImportingDocx}
                onChange={handleImportDocx}
              />
            </label>
          )}

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-1.5 rounded-lg bg-muted text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-1 w-44 bg-card border border-border rounded-xl shadow-xl p-1 z-50">
                <button
                  type="button"
                  onClick={exportDocx}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                >
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span>Word (.docx)</span>
                </button>
                <button
                  type="button"
                  onClick={exportMarkdown}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                >
                  <FileCode className="w-3.5 h-3.5 text-primary" />
                  <span>Markdown (.md)</span>
                </button>
                <button
                  type="button"
                  onClick={exportPDF}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>Download as PDF</span>
                </button>
                <button
                  type="button"
                  onClick={exportPlainText}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Plain Text (.txt)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------- */}
      {/* 2. Formatting Toolbar (Free extensions only)                  */}
      {/* ------------------------------------------------------------- */}
      {canEdit && !selectedHistoricalVersion && editor && (
        <div className="h-10 border-b border-border bg-card/60 px-4 flex items-center gap-1 overflow-x-auto shrink-0 z-20 scrollbar-none">
          {/* Headings */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("heading", { level: 1 }) ? "bg-muted text-primary font-bold" : ""
            }`}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("heading", { level: 2 }) ? "bg-muted text-primary font-bold" : ""
            }`}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("heading", { level: 3 }) ? "bg-muted text-primary font-bold" : ""
            }`}
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-border mx-1" />

          {/* Text formatting */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("bold") ? "bg-muted text-primary" : ""
            }`}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("italic") ? "bg-muted text-primary" : ""
            }`}
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("underline") ? "bg-muted text-primary" : ""
            }`}
            title="Underline (Ctrl+U)"
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("strike") ? "bg-muted text-primary" : ""
            }`}
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHighlight({ color: "#FFBB56" }).run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("highlight") ? "bg-muted text-amber-400" : ""
            }`}
            title="Highlight text"
          >
            <Highlighter className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-border mx-1" />

          {/* Lists */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("bulletList") ? "bg-muted text-primary" : ""
            }`}
            title="Bullet list"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("orderedList") ? "bg-muted text-primary" : ""
            }`}
            title="Numbered list"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive("taskList") ? "bg-muted text-primary" : ""
            }`}
            title="Task checklist"
          >
            <CheckSquare className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-border mx-1" />

          {/* Alignment */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive({ textAlign: "left" }) ? "bg-muted text-primary" : ""
            }`}
            title="Align left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive({ textAlign: "center" }) ? "bg-muted text-primary" : ""
            }`}
            title="Align center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={`p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground ${
              editor.isActive({ textAlign: "right" }) ? "bg-muted text-primary" : ""
            }`}
            title="Align right"
          >
            <AlignRight className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-border mx-1" />

          {/* Table */}
          <button
            type="button"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Insert table"
          >
            <TableIcon className="w-4 h-4" />
          </button>

          {/* Image Upload */}
          <label className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer" title="Insert image">
            <ImageIcon className="w-4 h-4" />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </label>

          {/* Playhead Video Card Insert */}
          <button
            type="button"
            onClick={() => setInsertVideoModalOpen(true)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Insert Playhead video card"
          >
            <Film className="w-4 h-4" />
          </button>

          {/* Team Note Block (Only available for team members) */}
          {isTeamMember && (
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleTeamNotes().run()}
              className={`p-1.5 rounded hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 flex items-center gap-1 text-xs font-semibold px-2 border border-amber-500/30 ${
                editor.isActive("team_notes") ? "bg-amber-500/30 text-amber-200" : "bg-amber-500/10"
              }`}
              title="Insert team-only note"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Team note</span>
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. Find & Replace Bar                                         */}
      {/* ------------------------------------------------------------- */}
      {showFindReplace && (
        <div className="bg-card/95 border-b border-border px-4 py-2 flex items-center gap-3 shrink-0 text-xs">
          <input
            type="text"
            placeholder="Find in document..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-muted border border-border rounded-lg px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48"
          />
          <input
            type="text"
            placeholder="Replace with..."
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            className="bg-muted border border-border rounded-lg px-2.5 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-48"
          />
          <button
            type="button"
            onClick={() => {
              if (!searchTerm || !editor) return;
              const text = editor.getText();
              const regex = new RegExp(searchTerm, "gi");
              const matches = text.match(regex);
              setMatchCount(matches ? matches.length : 0);
            }}
            className="px-2.5 py-1 bg-muted hover:bg-muted/80 rounded-lg text-foreground font-medium"
          >
            Count matches
          </button>
          {matchCount > 0 && (
            <span className="text-muted-foreground">{matchCount} matches</span>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. Editor Workspace & Sidebars                                */}
      {/* ------------------------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Floating Table of Contents Outline Panel */}
        {showOutline && (
          <aside className="w-64 border-r border-border bg-card/40 p-4 overflow-y-auto shrink-0 hidden md:block">
            <h3 className="text-xs font-semibold  text-muted-foreground mb-3">
              Outline
            </h3>
            {outlineItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No headings yet. Add H1, H2, or H3 headings to populate the outline.
              </p>
            ) : (
              <div className="space-y-1">
                {outlineItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => jumpToHeading(item.pos)}
                    className={`w-full text-left truncate text-xs py-1 px-1.5 rounded hover:bg-muted hover:text-foreground transition-colors ${
                      item.level === 1
                        ? "font-semibold text-foreground pl-1"
                        : item.level === 2
                        ? "text-muted-foreground pl-3"
                        : "text-muted-foreground/80 pl-5 text-xs"
                    }`}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            )}
          </aside>
        )}

        {/* Scrollable Document Area */}
        <div
          className={`flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center ${
            isDarkPage ? "bg-background" : "bg-neutral-100 dark:bg-neutral-900"
          }`}
        >
          {/* Historical Version Preview Banner */}
          {selectedHistoricalVersion && (
            <div className="w-full max-w-[816px] mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between text-xs text-amber-500 shrink-0">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 shrink-0" />
                <span>
                  Viewing snapshot (read-only):{" "}
                  <strong>{selectedHistoricalVersion.name || "Untitled version"}</strong>{" "}
                  <span className="text-muted-foreground ml-1">
                    ({new Date(selectedHistoricalVersion.created_at).toLocaleString()})
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowRestoreConfirm(true)}
                    className="px-3 py-1 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 text-xs"
                  >
                    Restore
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedHistoricalVersion(null)}
                  className="px-3 py-1 bg-muted hover:bg-muted/80 text-foreground font-semibold rounded-lg text-xs"
                >
                  Exit preview
                </button>
              </div>
            </div>
          )}

          {/* Document Sheet / Canvas */}
          <div
            className={`transition-all duration-200 ${
              isCanvasMode
                ? "w-full max-w-5xl"
                : "w-full max-w-[816px] min-h-[1056px] shadow-lg rounded-xl border border-border/60 p-8 sm:p-14"
            } ${
              isDarkPage
                ? "bg-card text-foreground"
                : "bg-white text-neutral-900 border-neutral-200"
            }`}
          >
            {selectedHistoricalVersion ? (
              <ReadOnlyVersionPreview contentJson={selectedHistoricalVersion.content_json} />
            ) : (
              <EditorContent editor={editor} />
            )}
          </div>
        </div>

        {/* Version History Drawer */}
        <VersionHistoryDrawer
          documentId={documentId}
          isOpen={showVersions}
          onClose={() => setShowVersions(false)}
          versions={versions}
          selectedVersionId={selectedHistoricalVersion?.id || null}
          onSelectVersion={setSelectedHistoricalVersion}
          onVersionRestored={(newVer) => {
            // Re-fetch versions
            apiRequest<{ versions: DocumentVersionItem[] }>(
              `/documents/${documentId}/versions`
            ).then((res) => {
              if (res?.versions) setVersions(res.versions);
            });
          }}
          canEdit={canEdit}
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. Footer Stats                                              */}
      {/* ------------------------------------------------------------- */}
      <footer className="h-8 border-t border-border bg-card/60 px-4 flex items-center justify-between text-xs text-muted-foreground shrink-0 z-20">
        <div className="flex items-center gap-4">
          <span>{words} words</span>
          <span>{characters} characters</span>
          <span>{readTimeMin} min read</span>
        </div>
        <div>
          <span>Playhead Docs</span>
        </div>
      </footer>

      {/* Insert Video Card Modal */}
      {insertVideoModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-overlay">
            <h3 className="text-base font-semibold text-foreground mb-1">
              Insert Playhead Video Card
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Enter the Item ID or URL of a video in your workspace. Permission checks will be applied automatically for all viewers.
            </p>
            <input
              type="text"
              placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
              value={videoItemIdInput}
              onChange={(e) => setVideoItemIdInput(e.target.value)}
              className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary mb-4"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInsertVideoModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!videoItemIdInput.trim()}
                onClick={handleInsertVideo}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Insert Video Card
              </button>
            </div>
          </div>
        </div>
      )}

      <PdfExportDialog
        open={showPdfExportDialog}
        onOpenChange={setShowPdfExportDialog}
        itemType="document"
        itemId={documentId}
        title={title || initialTitle || "Document"}
        isTeamMember={isTeamMember}
      />

      <ConfirmDialog
        open={showRestoreConfirm}
        onOpenChange={setShowRestoreConfirm}
        title="Restore version"
        description={`Restore "${selectedHistoricalVersion?.name || "this version"}"? A new version will be created with its contents.`}
        confirmLabel="Restore version"
        variant="primary"
        loading={isRestoringVersion}
        onConfirm={handleRestoreHistoricalVersion}
      />
    </div>
  );
}
