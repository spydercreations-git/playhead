"use client";

import React from "react";
import {
  Users,
  Share2,
  Download,
  Upload,
  FolderOutput,
  FolderInput,
  Copy,
  Edit3,
  Trash2,
} from "@/components/ui/icon";
import { MenuGroup } from "@/components/ui/menu";

export interface UnifiedItemMenuOptions {
  kind: "project" | "folder" | "file" | "document" | "spreadsheet";
  canDownload?: boolean;
  canUploadVersion?: boolean;
  onManageAccess: () => void;
  onCreateShareLink: () => void;
  onDownload: () => void;
  onUploadNewVersion?: () => void;
  onCopyTo: () => void;
  onMoveTo: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function buildUnifiedItemMenuGroups(options: UnifiedItemMenuOptions): MenuGroup[] {
  const {
    kind,
    canDownload = true,
    canUploadVersion = true,
    onManageAccess,
    onCreateShareLink,
    onDownload,
    onUploadNewVersion,
    onCopyTo,
    onMoveTo,
    onDuplicate,
    onRename,
    onDelete,
  } = options;

  const isFolderOrProject = kind === "folder" || kind === "project";

  return [
    // Group 1: Manage access, Copy link, Download (ZIP)
    {
      items: [
        {
          label: "Manage access",
          icon: <Users className="w-4 h-4 text-[var(--text-2)]" />,
          onClick: onManageAccess,
        },
        {
          label: "Copy link",
          icon: <Share2 className="w-4 h-4 text-[var(--text-2)]" />,
          onClick: onCreateShareLink,
        },
        {
          label: "Download",
          icon: <Download className="w-4 h-4 text-[var(--text-2)]" />,
          shortcut: isFolderOrProject ? "ZIP" : undefined,
          onClick: onDownload,
          show: canDownload,
        },
      ],
    },
    // Group 2: Copy to, Move to, Duplicate, Rename
    {
      items: [
        {
          label: "Copy to",
          icon: <FolderOutput className="w-4 h-4 text-[var(--text-2)]" />,
          shortcut: "›",
          onClick: onCopyTo,
        },
        {
          label: "Move to",
          icon: <FolderInput className="w-4 h-4 text-[var(--text-2)]" />,
          shortcut: "›",
          onClick: onMoveTo,
        },
        {
          label: "Duplicate",
          icon: <Copy className="w-4 h-4 text-[var(--text-2)]" />,
          onClick: onDuplicate,
        },
        {
          label: "Rename",
          icon: <Edit3 className="w-4 h-4 text-[var(--text-2)]" />,
          onClick: onRename,
        },
      ],
    },
    // Group 3: Delete (red, last)
    {
      items: [
        {
          label: "Delete",
          icon: <Trash2 className="w-4 h-4 text-[#F0506E]" />,
          danger: true,
          onClick: onDelete,
        },
      ],
    },
  ];
}
