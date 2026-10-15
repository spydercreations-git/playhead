"use client";

import React, { useRef, useEffect } from "react";
import { Folder, MoreHorizontal, Check, Lock } from "lucide-react";

interface FolderCardProps {
  id: string;
  name: string;
  itemCount: number;
  totalBytes?: number;
  isRestricted?: boolean;
  thumbnails?: string[];
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  isRenaming?: boolean;
  renameValue?: string;
  onRenameChange?: (val: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
  isDropTarget?: boolean;
  dropLabel?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function FolderCard({
  id,
  name,
  itemCount,
  totalBytes = 0,
  isRestricted = false,
  thumbnails = [],
  isSelected,
  onToggleSelect,
  onOpen,
  onContextMenu,
  isRenaming = false,
  renameValue = "",
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  isDropTarget = false,
  dropLabel,
}: FolderCardProps) {
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const isEmpty = itemCount === 0 && thumbnails.length === 0;

  return (
    <div
      onDoubleClick={onOpen}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".folder-menu-btn")) return;
        if ((e.target as HTMLElement).closest(".folder-checkbox")) return;
        if (isRenaming) return;
        onToggleSelect();
      }}
      onContextMenu={onContextMenu}
      className="group relative pt-3.5 select-none cursor-pointer"
    >
      {/* Top Left Folder Tab */}
      <div
        className={`absolute top-0 left-0 h-4 w-28 rounded-t-[8px] border-t border-l border-r transition-all z-10 ${
          isDropTarget
            ? "bg-[#212121] border-[#4876F3] border-t-2 border-l-2 border-r-2"
            : isSelected
            ? "bg-[#212121] border-[#4876F3]"
            : "bg-[#212121] border-[#2E2F34] group-hover:border-[#424344]"
        }`}
      >
        <div className="absolute -bottom-0.5 left-0 right-0 h-1 bg-[#212121]" />
      </div>

      {/* Main Folder Body */}
      <div
        className={`relative rounded-[12px] rounded-tl-none border p-3 transition-all ${
          isDropTarget
            ? "border-2 border-[#4876F3] bg-[#4876F3]/10 shadow-lg ring-2 ring-[#4876F3]/30"
            : isSelected
            ? "bg-[#212121] border-[#4876F3] shadow-md ring-1 ring-[#4876F3]/50"
            : "bg-[#212121] border-[#2E2F34] group-hover:border-[#424344]"
        }`}
      >
        {/* Preview Container: 1 large + 2 small slots (Empty slots: #2E2F35 box with grey folder icon) */}
        <div className="relative h-32 w-full rounded-[8px] bg-[#181818] p-1.5 flex gap-1.5 overflow-hidden mb-3">
          {isEmpty ? (
            /* Plain body for empty folder */
            <div className="w-full h-full rounded-[6px] bg-[#212121] flex items-center justify-center">
              <Folder className="w-8 h-8 text-[#2E2F34]" />
            </div>
          ) : (
            <>
              {/* Left Slot: 1 Large Thumbnail */}
              <div className="flex-1 h-full rounded-[6px] bg-[#2E2F35] overflow-hidden flex items-center justify-center relative">
                {thumbnails[0] ? (
                  <img
                    src={thumbnails[0]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Folder className="w-7 h-7 text-[#7C7F87]" />
                )}
              </div>

              {/* Right Column: 2 Small Thumbnails */}
              <div className="w-[34%] h-full flex flex-col gap-1.5">
                <div className="flex-1 rounded-[6px] bg-[#2E2F35] overflow-hidden flex items-center justify-center relative">
                  {thumbnails[1] ? (
                    <img
                      src={thumbnails[1]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Folder className="w-4 h-4 text-[#7C7F87]" />
                  )}
                </div>
                <div className="flex-1 rounded-[6px] bg-[#2E2F35] overflow-hidden flex items-center justify-center relative">
                  {thumbnails[2] ? (
                    <img
                      src={thumbnails[2]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Folder className="w-4 h-4 text-[#7C7F87]" />
                  )}
                </div>
              </div>
            </>
          )}

          {/* Badges on preview: Restricted Lock badge */}
          {isRestricted && (
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 border border-amber-500/30 text-amber-400 text-[10px] font-semibold z-20">
              <Lock className="w-3 h-3" />
              <span>Restricted</span>
            </div>
          )}

          {/* Checkbox at top-left of the preview */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={`folder-checkbox absolute top-2.5 left-2.5 h-4.5 w-4.5 rounded-[5px] flex items-center justify-center transition-all z-20 ${
              isSelected
                ? "bg-[#4876F3] border border-[#4876F3] text-white opacity-100"
                : "border border-[#7C7F87]/60 bg-black/40 hover:border-white text-transparent opacity-0 group-hover:opacity-100"
            }`}
          >
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </button>
        </div>

        {/* Folder Meta / Rename */}
        <div className="flex items-center justify-between min-h-[36px]">
          <div className="min-w-0 flex-1 pr-2">
            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onRenameChange && onRenameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (onRenameSubmit) onRenameSubmit();
                  } else if (e.key === "Escape") {
                    if (onRenameCancel) onRenameCancel();
                  }
                }}
                onBlur={() => {
                  if (onRenameSubmit) onRenameSubmit();
                }}
                className="w-full h-7 rounded-lg bg-[#2A2B30] border border-[#4876F3] px-2 text-xs text-white focus:outline-none"
              />
            ) : (
              <>
                <p className="text-xs font-semibold text-white truncate leading-tight flex items-center gap-1.5">
                  <span className="truncate">{name}</span>
                  {isRestricted && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}
                </p>
                {isDropTarget ? (
                  <p className="text-[11px] font-medium text-[#4876F3] truncate mt-0.5 animate-pulse">
                    {dropLabel || "Move to folder"}
                  </p>
                ) : (
                  <p className="text-[11px] text-[#9A9DA0] truncate mt-0.5">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                    {totalBytes > 0 && ` · ${formatBytes(totalBytes)}`}
                  </p>
                )}
              </>
            )}
          </div>

          {/* ⋯ button bottom right */}
          {!isRenaming && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e);
              }}
              className="folder-menu-btn flex h-7 w-7 items-center justify-center rounded-lg text-[#9A9DA0] hover:bg-[#2A2B30] hover:text-white transition-colors shrink-0"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
