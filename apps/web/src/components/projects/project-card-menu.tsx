"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/icon";

export interface ProjectCardMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRect?: DOMRect | null;
  clickPosition?: { x: number; y: number } | null;
  project: {
    id: string;
    name: string;
    client_id?: string;
    client_name?: string;
    status: string;
  };
  permissions: {
    canManageAccess: boolean;
    canCreateProject: boolean;
    canRenameProject: boolean;
    canDeleteProject: boolean;
  };
  onOpen: () => void;
  onManageAccess: () => void;
  onCopyLink: () => void;
  onDownloadZip: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}

export function ProjectCardMenu({
  isOpen,
  onClose,
  anchorRect,
  clickPosition,
  project,
  permissions,
  onOpen,
  onManageAccess,
  onCopyLink,
  onDownloadZip,
  onDuplicate,
  onRename,
  onToggleActive,
  onDelete,
}: ProjectCardMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute position: flips upward when no room below, never covers button
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const menuWidth = 210;
      const estimatedHeight = 270;
      const padding = 8;
      const gap = 4;

      let top = 0;
      let left = 0;

      if (anchorRect) {
        // Opened from ⋯ button
        const spaceBelow = window.innerHeight - anchorRect.bottom;
        const shouldFlipUp = spaceBelow < estimatedHeight + padding && anchorRect.top > estimatedHeight + padding;

        if (shouldFlipUp) {
          top = anchorRect.top - estimatedHeight - gap;
        } else {
          top = anchorRect.bottom + gap;
        }

        left = anchorRect.right - menuWidth;
      } else if (clickPosition) {
        // Opened from right-click contextmenu
        top = clickPosition.y;
        left = clickPosition.x;

        if (top + estimatedHeight > window.innerHeight - padding) {
          top = Math.max(padding, clickPosition.y - estimatedHeight);
        }
      }

      // Clamp horizontally inside viewport
      left = Math.max(padding, Math.min(left, window.innerWidth - menuWidth - padding));
      // Clamp vertically inside viewport
      top = Math.max(padding, Math.min(top, window.innerHeight - estimatedHeight - padding));

      setCoords({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, anchorRect, clickPosition]);

  // Click outside and escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const isInactive = project.status === "inactive";

  const menuContent = (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        zIndex: 9999,
        width: 210,
      }}
      className="rounded-xl bg-[#18191d] border border-[#2c2d33] shadow-2xl py-1.5 text-xs text-[#e1e2e6] select-none animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* 1. Open */}
      <button
        type="button"
        onClick={() => {
          onClose();
          onOpen();
        }}
        className="w-[calc(100%-8px)] mx-1 px-2.5 py-1.5 flex items-center gap-2.5 rounded-lg hover:bg-[#282a32] text-left transition-colors cursor-pointer"
      >
        <Icon name="open_in_new" size={17} className="text-[#a0a2aa] shrink-0" />
        <span>Open</span>
      </button>

      {/* Separator 1 (Only show if at least one item below is visible) */}
      {(permissions.canManageAccess || true) && (
        <div className="h-px bg-[#2c2d33] my-1 mx-1.5" />
      )}

      {/* 2. Manage access (requires manage_access) */}
      {permissions.canManageAccess && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onManageAccess();
          }}
          className="w-[calc(100%-8px)] mx-1 px-2.5 py-1.5 flex items-center gap-2.5 rounded-lg hover:bg-[#282a32] text-left transition-colors cursor-pointer"
        >
          <Icon name="person_add" size={17} className="text-[#a0a2aa] shrink-0" />
          <span>Manage access</span>
        </button>
      )}

      {/* 3. Copy link */}
      <button
        type="button"
        onClick={() => {
          onClose();
          onCopyLink();
        }}
        className="w-[calc(100%-8px)] mx-1 px-2.5 py-1.5 flex items-center gap-2.5 rounded-lg hover:bg-[#282a32] text-left transition-colors cursor-pointer"
      >
        <Icon name="link" size={17} className="text-[#a0a2aa] shrink-0" />
        <span>Copy link</span>
      </button>

      {/* 4. Download (ZIP badge on right) */}
      <button
        type="button"
        onClick={() => {
          onClose();
          onDownloadZip();
        }}
        className="w-[calc(100%-8px)] mx-1 px-2.5 py-1.5 flex items-center gap-2.5 rounded-lg hover:bg-[#282a32] text-left transition-colors cursor-pointer group"
      >
        <Icon name="download" size={17} className="text-[#a0a2aa] shrink-0" />
        <span>Download</span>
        <span className="ml-auto text-[10px] font-medium tracking-wide text-[var(--text-3)] group-hover:text-white transition-colors">
          ZIP
        </span>
      </button>

      {/* Separator 2 */}
      {(permissions.canCreateProject || permissions.canRenameProject || true) && (
        <div className="h-px bg-[#2c2d33] my-1 mx-1.5" />
      )}

      {/* 5. Duplicate (requires create_project) */}
      {permissions.canCreateProject && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onDuplicate();
          }}
          className="w-[calc(100%-8px)] mx-1 px-2.5 py-1.5 flex items-center gap-2.5 rounded-lg hover:bg-[#282a32] text-left transition-colors cursor-pointer"
        >
          <Icon name="add_box" size={17} className="text-[#a0a2aa] shrink-0" />
          <span>Duplicate</span>
        </button>
      )}

      {/* 6. Rename (requires rename_project) */}
      {permissions.canRenameProject && (
        <button
          type="button"
          onClick={() => {
            onClose();
            onRename();
          }}
          className="w-[calc(100%-8px)] mx-1 px-2.5 py-1.5 flex items-center gap-2.5 rounded-lg hover:bg-[#282a32] text-left transition-colors cursor-pointer"
        >
          <Icon name="edit" size={17} className="text-[#a0a2aa] shrink-0" />
          <span>Rename</span>
        </button>
      )}

      {/* 7. Mark inactive / Mark active */}
      <button
        type="button"
        onClick={() => {
          onClose();
          onToggleActive();
        }}
        className="w-[calc(100%-8px)] mx-1 px-2.5 py-1.5 flex items-center gap-2.5 rounded-lg hover:bg-[#282a32] text-left transition-colors cursor-pointer"
      >
        <Icon
          name={isInactive ? "unarchive" : "move_to_inbox"}
          size={17}
          className="text-[#a0a2aa] shrink-0"
        />
        <span>{isInactive ? "Mark active" : "Mark inactive"}</span>
      </button>

      {/* Separator 3 (Only show if delete permission is granted) */}
      {permissions.canDeleteProject && (
        <>
          <div className="h-px bg-[#2c2d33] my-1 mx-1.5" />

          {/* 8. Delete (red, last, goes to trash) */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onDelete();
            }}
            className="w-[calc(100%-8px)] mx-1 px-2.5 py-1.5 flex items-center gap-2.5 rounded-lg text-[#ff5c5c] hover:bg-red-500/10 text-left transition-colors cursor-pointer"
          >
            <Icon name="delete" size={17} className="text-[#ff5c5c] shrink-0" />
            <span>Delete</span>
          </button>
        </>
      )}
    </div>
  );

  return createPortal(menuContent, document.body);
}
