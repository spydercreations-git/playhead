"use client";

import React, { useRef, useState, useEffect } from "react";
import { Folder, MoreHorizontal, Check, Lock } from "@/components/ui/icon";

interface FolderCardProps {
  id: string;
  name: string;
  itemCount: number;
  totalBytes?: number;
  thumbnails?: string[];
  isSelected: boolean;
  selectionActive?: boolean;
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
  thumbnails = [],
  isSelected,
  selectionActive = false,
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(278);

  useEffect(() => {
    if (!containerRef.current) return;
    const updateWidth = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width > 0) {
          setWidth(Math.round(rect.width));
        }
      }
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const borderColor = isDropTarget || isSelected
    ? "#4876F3"
    : "var(--border)";

  const borderWidth = isDropTarget ? 2 : 1;

  const W = width;
  const H = 290;
  const bodyPath = `M0.5 ${H - 12.5} V10.5 Q0.5 0.5 10.5 0.5 H88 C96 0.5 100 2.5 105 7.5 L111 13.5 C115 17.5 118 18.5 124 18.5 H${W - 12.5} Q${W - 0.5} 18.5 ${W - 0.5} 30.5 V${H - 12.5} Q${W - 0.5} ${H - 0.5} ${W - 12.5} ${H - 0.5} H12.5 Q0.5 ${H - 0.5} 0.5 ${H - 12.5} Z`;
  const tabPath = "M0.5 18.5 V10.5 Q0.5 0.5 10.5 0.5 H88 C96 0.5 100 2.5 105 7.5 L111 13.5 C115 17.5 118 18.5 124 18.5 Z";

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="button"
      aria-label={`${name}, folder, ${itemCount} ${itemCount === 1 ? "file" : "files"}`}
      aria-selected={isSelected}
      onDoubleClick={onOpen}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".folder-menu-btn")) return;
        if ((e.target as HTMLElement).closest(".folder-checkbox")) return;
        if (isRenaming) return;
        onToggleSelect();
      }}
      onKeyDown={(e) => {
        if (isRenaming) return;
        if (e.target !== e.currentTarget && (e.target as HTMLElement).closest(".folder-menu-btn")) {
          return;
        }
        if (e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          onToggleSelect();
        } else if (e.key === "Enter") {
          e.preventDefault();
          onOpen();
        }
      }}
      onContextMenu={onContextMenu}
      className="group relative h-[290px] w-full select-none cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4876F3]"
    >
      {/* SVG Background (from New Cards/folder-card-shape.svg continuous outline) */}
      <svg
        className="absolute top-0 left-0 w-full h-[290px] pointer-events-none overflow-visible"
        fill="none"
      >
        <path d={bodyPath} fill="var(--panel)" />
        <path d={tabPath} fill="var(--panel-raised)" />
        <path
          d={bodyPath}
          fill="none"
          stroke={borderColor}
          strokeWidth={borderWidth}
          className="transition-colors group-hover:stroke-[var(--border-strong)]"
        />
      </svg>

      <div className="relative z-10 h-full w-full pt-[28px] px-3 pb-3 flex flex-col justify-between">
        {/* Preview Container: 1 big + 2 small slots, 6px gap, radius 8, height 150px */}
        <div className="relative h-[150px] w-full">
          <div className="h-[150px] w-full flex gap-1.5">
            {/* Big Slot */}
            <div className="flex-1 h-[150px] rounded-[8px] bg-[#161618] border border-[var(--border)] overflow-hidden relative flex items-center justify-center">
              {thumbnails[0] ? (
                <img
                  src={thumbnails[0]}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--text-3)]">
                  <Folder size={24} />
                </div>
              )}
            </div>

            {/* Small Slots */}
            <div className="w-[36%] h-[150px] flex flex-col gap-1.5">
              <div className="h-[72px] rounded-[8px] bg-[#161618] border border-[var(--border)] overflow-hidden relative flex items-center justify-center">
                {thumbnails[1] ? (
                  <img
                    src={thumbnails[1]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-3)]">
                    <Folder size={16} />
                  </div>
                )}
              </div>
              <div className="h-[72px] rounded-[8px] bg-[#161618] border border-[var(--border)] overflow-hidden relative flex items-center justify-center">
                {thumbnails[2] ? (
                  <img
                    src={thumbnails[2]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-3)]">
                    <Folder size={16} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selection Checkbox (Top-left of preview) */}
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Select ${name}`}
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                e.stopPropagation();
                onToggleSelect();
              }
            }}
            className={`folder-checkbox absolute top-2 left-2 h-5 w-5 rounded-[6px] flex items-center justify-center transition-colors z-20 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#4876F3] ${
              isSelected
                ? "bg-[#4876F3] border border-[#4876F3] text-white opacity-100"
                : selectionActive
                ? "border border-[var(--border-strong)] bg-[var(--panel)] hover:border-white text-transparent opacity-100"
                : "border border-[var(--border-strong)] bg-[var(--panel)] hover:border-white text-transparent opacity-0 group-hover:opacity-100"
            }`}
          >
            <Check size={16} className={isSelected ? "text-white" : "opacity-0"} />
          </button>
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
                className="w-full h-7 rounded-[8px] bg-[var(--input)] border border-[#4876F3] px-2 text-xs text-white focus:outline-none"
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
                  <p className="text-[13px] text-[var(--text-2)] truncate mt-0.5">
                    {itemCount === 0 ? (
                      "Empty"
                    ) : (
                      <>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                        {totalBytes > 0 && `  ·  ${formatBytes(totalBytes)}`}
                      </>
                    )}
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
              aria-label="Folder options"
              className="folder-menu-btn flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-2)] hover:bg-[var(--input)] hover:text-white transition-colors shrink-0"
            >
              <MoreHorizontal size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
