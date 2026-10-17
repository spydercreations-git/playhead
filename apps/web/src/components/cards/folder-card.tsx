"use client";

import React, { useRef, useEffect } from "react";
import { Folder, MoreHorizontal, Check, Lock } from "@/components/ui/icon";

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
  onContextMenu: (e: React.MouseEvent | HTMLElement) => void;
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
  id: _id,
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

  const borderColor = isDropTarget || isSelected
    ? "#4876F3"
    : "#2E2F34";

  const borderWidth = isDropTarget ? 2 : 1;

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
      className={`group relative h-[290px] w-full select-none cursor-pointer transition-transform duration-150 hover:scale-[1.015] ${
        isSelected ? "scale-[1.015]" : ""
      }`}
    >
      {/* SVG Background (shape-project-folder.svg: Tab stays fixed at top left, body stretches with card width) */}
      <svg
        className="absolute top-0 left-0 w-full h-[290px] pointer-events-none overflow-visible"
        fill="none"
      >
        <path
          d="M0 22 V12 q0 -10 10 -10 h80 q8 0 13 5 l6 6 q4 4 10 4 V22 H0z"
          fill="#26272C"
          stroke={borderColor}
          strokeWidth={borderWidth}
          className="transition-colors group-hover:stroke-[#424344]"
        />
        <rect
          x="0"
          y="18"
          width="100%"
          height="272"
          rx="12"
          fill="#212121"
          stroke={borderColor}
          strokeWidth={borderWidth}
          className="transition-colors group-hover:stroke-[#424344]"
        />
      </svg>

      <div className="relative z-10 h-full w-full pt-[28px] px-3 pb-3 flex flex-col justify-between">
        {/* Preview Container: 1 big + 2 small slots, 6px gap, radius 8, height 150px */}
        <div className="relative h-[150px] w-full">
          {thumbnails.length === 0 ? (
            <div className="h-[150px] w-full rounded-[8px] bg-[#2C2D33] flex items-center justify-center text-[#7C7F87]">
              <Folder size={36} className="text-[#7C7F87]" />
            </div>
          ) : (
            <div className="h-[150px] w-full flex gap-1.5">
              {/* Big Slot */}
              <div className="flex-1 h-[150px] rounded-[8px] bg-[#000000] overflow-hidden relative flex items-center justify-center">
                {thumbnails[0] ? (
                  <img
                    src={thumbnails[0]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[#2C2D33] flex items-center justify-center text-[#7C7F87]">
                    <Folder size={24} className="text-[#7C7F87]" />
                  </div>
                )}
              </div>

              {/* Small Slots */}
              <div className="w-[36%] h-[150px] flex flex-col gap-1.5">
                <div className="h-[72px] rounded-[8px] bg-[#000000] overflow-hidden relative flex items-center justify-center">
                  {thumbnails[1] ? (
                    <img
                      src={thumbnails[1]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#2C2D33] flex items-center justify-center text-[#7C7F87]">
                      <Folder size={18} className="text-[#7C7F87]" />
                    </div>
                  )}
                </div>
                <div className="h-[72px] rounded-[8px] bg-[#000000] overflow-hidden relative flex items-center justify-center">
                  {thumbnails[2] ? (
                    <img
                      src={thumbnails[2]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#2C2D33] flex items-center justify-center text-[#7C7F87]">
                      <Folder size={18} className="text-[#7C7F87]" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Selection Checkbox (Top-left of preview) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={`folder-checkbox absolute top-2 left-2 h-5 w-5 rounded-[6px] flex items-center justify-center transition-all z-20 ${
              isSelected
                ? "bg-[#4876F3] border border-[#4876F3] text-white opacity-100"
                : "border border-[#7C7F87]/60 bg-black/60 hover:border-white text-transparent opacity-0 group-hover:opacity-100"
            }`}
          >
            <Check size={14} className="text-white" />
          </button>

          {/* Restricted Badge (Top-right of preview) */}
          {isRestricted && (
            <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/70 backdrop-blur-sm px-1.5 py-0.5 border border-[#FFBB56]/30 text-[#FFBB56] text-xs font-semibold z-20">
              <Lock size={12} />
              <span>Restricted</span>
            </div>
          )}
        </div>

        {/* Folder Footer */}
        <div className="pt-3 px-0.5 flex items-center justify-between min-h-[44px]">
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
                className="w-full h-7 rounded-[8px] bg-[#2A2B30] border border-[#4876F3] px-2 text-xs text-white focus:outline-none"
              />
            ) : (
              <>
                <p className="text-base font-semibold text-white truncate leading-tight flex items-center gap-1.5">
                  <span className="truncate">{name}</span>
                </p>
                {isDropTarget ? (
                  <p className="text-[13px] font-medium text-[#4876F3] truncate mt-0.5 animate-pulse">
                    {dropLabel || "Move to folder"}
                  </p>
                ) : (
                  <p className="text-[13px] text-[#7C7F87] truncate mt-0.5">
                    {itemCount} {itemCount === 1 ? "file" : "files"}
                    {totalBytes > 0 && `  ·  ${formatBytes(totalBytes)}`}
                  </p>
                )}
              </>
            )}
          </div>

          {!isRenaming && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e.currentTarget);
              }}
              className="folder-menu-btn flex h-7 w-7 items-center justify-center rounded-md text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white transition-colors shrink-0"
            >
              <MoreHorizontal size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
