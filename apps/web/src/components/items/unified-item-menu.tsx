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

  const isFile = kind === "file";

  return [
    // Group 1: Access and Sharing
    {
      items: [
        {
          label: "Manage access",
          icon: <Users className="w-3.5 h-3.5 text-[#A3A6AD]" />,
          onClick: onManageAccess,
        },
        {
          label: "Create share link",
          icon: <Share2 className="w-3.5 h-3.5 text-[#A3A6AD]" />,
          onClick: onCreateShareLink,
        },
      ],
    },
    // Group 2: Actions
    {
      items: [
        {
          label: "Download",
          icon: <Download className="w-3.5 h-3.5 text-[#A3A6AD]" />,
          onClick: onDownload,
          show: canDownload,
        },
        ...(isFile && onUploadNewVersion
          ? [
              {
                label: "Upload new version",
                icon: <Upload className="w-3.5 h-3.5 text-[#A3A6AD]" />,
                onClick: onUploadNewVersion,
                show: canUploadVersion,
              },
            ]
          : []),
        {
          label: "Copy to",
          icon: <FolderOutput className="w-3.5 h-3.5 text-[#A3A6AD]" />,
          onClick: onCopyTo,
        },
        {
          label: "Move to",
          icon: <FolderInput className="w-3.5 h-3.5 text-[#A3A6AD]" />,
          onClick: onMoveTo,
        },
        {
          label: "Duplicate",
          icon: <Copy className="w-3.5 h-3.5 text-[#A3A6AD]" />,
          onClick: onDuplicate,
        },
        {
          label: "Rename",
          icon: <Edit3 className="w-3.5 h-3.5 text-[#A3A6AD]" />,
          onClick: onRename,
        },
      ],
    },
    // Group 3: Delete
    {
      items: [
        {
          label: "Delete",
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-400" />,
          danger: true,
          onClick: onDelete,
        },
      ],
    },
  ];
}
