"use client";

import React from "react";
import { MATERIAL_SYMBOLS_DATA, ICON_NAME_MAP } from "./icon-data";

export type MaterialSymbolName = keyof typeof MATERIAL_SYMBOLS_DATA;

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  size?: 16 | 18 | 20 | 24 | number;
  filled?: boolean;
  className?: string;
}

/**
 * Universal Icon Component for Playhead
 * Uses Google Material Symbols Rounded (Weight 300) SVGs
 * 
 * Rules:
 * - Outline style by default
 * - Filled only for active states (active sidebar item, starred star, selected tab)
 * - Color follows text color (currentColor)
 */
export function Icon({
  name,
  size = 20,
  filled = false,
  className = "",
  style,
  ...props
}: IconProps) {
  // Support both Material Symbol names (e.g. "arrow_back") and legacy names (e.g. "ArrowLeft")
  const resolvedName = ICON_NAME_MAP[name] || name;
  const data = MATERIAL_SYMBOLS_DATA[resolvedName];

  if (!data) {
    // Graceful fallback for missing icon name
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 -960 960 960"
        fill="currentColor"
        className={`shrink-0 inline-block align-middle ${className}`}
        aria-hidden="true"
        style={style}
        {...props}
      >
        <path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z" />
      </svg>
    );
  }

  const pathD = filled ? (data.fill || data.outline) : data.outline;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      className={`shrink-0 inline-block align-middle ${className}`}
      aria-hidden="true"
      style={style}
      {...props}
    >
      <path d={pathD} />
    </svg>
  );
}

export function createIcon(name: string, defaultSize = 20) {
  const IconComponent = React.forwardRef<
    SVGSVGElement,
    React.SVGProps<SVGSVGElement> & { size?: number; filled?: boolean; strokeWidth?: number }
  >(({ size = defaultSize, filled, className = "", strokeWidth: _sw, ...props }, ref) => {
    return (
      <Icon
        ref={ref as any}
        name={name}
        size={size}
        filled={filled}
        className={className}
        {...props}
      />
    );
  });
  IconComponent.displayName = `Icon(${name})`;
  return IconComponent;
}

// Pre-bound standard icon components
export const Folder = createIcon("folder");
export const FolderOpen = createIcon("folder_open");
export const FolderPlus = createIcon("create_new_folder");
export const MoreHorizontal = createIcon("more_horiz");
export const MoreVertical = createIcon("more_vert");
export const Lock = createIcon("lock");
export const Check = createIcon("check");
export const Film = createIcon("movie");
export const FileText = createIcon("description");
export const FileSpreadsheet = createIcon("table_chart");
export const Clock = createIcon("schedule");
export const Plus = createIcon("add");
export const Search = createIcon("search");
export const Upload = createIcon("upload");
export const Download = createIcon("download");
export const Trash = createIcon("delete");
export const Trash2 = createIcon("delete");
export const X = createIcon("close");
export const ArrowRight = createIcon("arrow_forward");
export const ArrowLeft = createIcon("arrow_back");
export const ChevronDown = createIcon("expand_more");
export const ChevronRight = createIcon("chevron_right");
export const ChevronLeft = createIcon("chevron_left");
export const Loader2 = createIcon("progress_activity");
export const Eye = createIcon("visibility");
export const EyeOff = createIcon("visibility_off");
export const Share2 = createIcon("share");
export const Copy = createIcon("content_copy");
export const Edit = createIcon("edit");
export const Star = createIcon("star");
export const Calendar = createIcon("calendar_today");
export const Layers = createIcon("layers");
export const AlertCircle = createIcon("error");
export const Building2 = createIcon("domain");

export default Icon;

