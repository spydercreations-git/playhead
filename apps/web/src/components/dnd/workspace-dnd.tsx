"use client";

import React from "react";
import {
  useDraggable,
  useDroppable,
  DragOverlay,
} from "@dnd-kit/core";
import { Folder, Film, FileText, Music, Image as ImageIcon, FileSpreadsheet } from "@/components/ui/icon";

export interface WorkspaceDragData {
  type: "folder" | "file";
  id: string;
  name: string;
  itemCount?: number;
  totalBytes?: number;
  selectedIds?: string[];
}

export interface WorkspaceDropData {
  type: "folder" | "root";
  id: string | null;
  name: string;
}

/**
 * Draggable Item Wrapper
 */
export function DraggableItem({
  id,
  data,
  children,
  className = "",
}: {
  id: string;
  data: WorkspaceDragData;
  children: React.ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`${className} ${isDragging ? "opacity-40 select-none cursor-grabbing" : "cursor-grab"}`}
      style={{ touchAction: "none" }}
    >
      {children}
    </div>
  );
}

/**
 * Droppable Target Wrapper for canvas folders, tree items, and breadcrumbs
 */
export function DroppableTarget({
  id,
  data,
  children,
  activeDragId,
  draggedDescendants = [],
  className = "",
  renderOverState,
}: {
  id: string;
  data: WorkspaceDropData;
  children: React.ReactNode;
  activeDragId: string | null;
  draggedDescendants?: string[];
  className?: string;
  renderOverState?: (isOverValid: boolean) => React.ReactNode;
}) {
  const isSelf = activeDragId === data.id;
  const isDescendant = !!data.id && draggedDescendants.includes(data.id);
  const isForbidden = isSelf || isDescendant;

  const { setNodeRef, isOver } = useDroppable({
    id,
    data,
    disabled: isForbidden,
  });

  const isOverValid = isOver && !isForbidden && !!activeDragId;

  return (
    <div
      ref={setNodeRef}
      className={`transition-all duration-150 relative ${className} ${
        isOverValid
          ? "ring-2 ring-[#4876F3] bg-[#4876F3]/10 rounded-[10px]"
          : isOver && isForbidden
          ? "cursor-not-allowed opacity-60"
          : ""
      }`}
    >
      {renderOverState ? renderOverState(isOverValid) : children}
    </div>
  );
}

/**
 * Floating Drag Ghost overlay for dnd-kit
 */
export function WorkspaceDragGhost({
  activeItem,
  selectedCount = 1,
}: {
  activeItem: WorkspaceDragData | null;
  selectedCount?: number;
}) {
  if (!activeItem) return null;

  const isFolder = activeItem.type === "folder";
  const count = selectedCount > 1 ? selectedCount : 1;

  return (
    <div className="relative pointer-events-none select-none z-50">
      {/* If multiple items, render card stack behind */}
      {count > 1 && (
        <div className="absolute -inset-1.5 translate-x-1.5 translate-y-1.5 bg-[var(--input)] rounded-xl border border-[var(--border)] opacity-50 shadow-lg" />
      )}
      {count > 2 && (
        <div className="absolute -inset-3 translate-x-3 translate-y-3 bg-[var(--panel)] rounded-xl border border-[var(--border)] opacity-30 shadow-lg" />
      )}

      {/* Main Ghost Card */}
      <div className="w-56 p-3 rounded-xl bg-[var(--panel-raised)] border-2 border-[#4876F3] shadow-overlay flex items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--input)] border border-[var(--border)] flex items-center justify-center shrink-0">
            {isFolder ? (
              <Folder className="w-4 h-4 text-[#4876F3]" />
            ) : activeItem.name.endsWith(".mp4") || activeItem.name.endsWith(".mov") ? (
              <Film className="w-4 h-4 text-purple-400" />
            ) : activeItem.name.endsWith(".xlsx") || activeItem.name.endsWith(".csv") ? (
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            ) : activeItem.name.endsWith(".mp3") || activeItem.name.endsWith(".wav") ? (
              <Music className="w-4 h-4 text-amber-400" />
            ) : (
              <FileText className="w-4 h-4 text-[var(--text-3)]" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {activeItem.name}
            </p>
            <p className="text-xs text-[var(--text-2)] truncate mt-0.5">
              {isFolder ? "Folder" : "File"}
            </p>
          </div>
        </div>

        {count > 1 && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#4876F3] text-white text-xs font-bold shadow">
            {count} items
          </span>
        )}
      </div>
    </div>
  );
}
