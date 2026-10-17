"use client";

import React from "react";
import { MATERIAL_SYMBOLS_DATA, ICON_NAME_MAP } from "./icon-data";

export type MaterialSymbolName = keyof typeof MATERIAL_SYMBOLS_DATA;

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  size?: 16 | 18 | 20 | 24 | number;
  filled?: boolean;
  className?: string;
  strokeWidth?: number;
}

export type LucideIcon = React.ForwardRefExoticComponent<
  React.SVGProps<SVGSVGElement> & {
    size?: number;
    filled?: boolean;
    strokeWidth?: number;
    className?: string;
    color?: string;
    withBackground?: boolean;
  } & React.RefAttributes<SVGSVGElement>
>;

/**
 * Universal Icon Component for Playhead
 * Uses Google Material Symbols Rounded (Weight 300) SVGs
 * 
 * Rules:
 * - Outline style by default
 * - Filled only for active states (active sidebar item, starred star, selected tab)
 * - Color follows text color (currentColor)
 */
function getIconColor(className: string = "", explicitColor?: string, styleColor?: string): string | undefined {
  if (explicitColor) return explicitColor;
  if (styleColor) return styleColor;

  // Status icons & active/selected state keep their meaningful color
  const statusRegex = /(text-(?:\[#(?:3FCF8E|3fcf8e|F0506E|f0506e|FFD43B|ffd43b|FF9F43|ff9f43|4876F3|4876f3|3B67E0|3b67e0|FACC15|facc15|4ADE80|4ade80|8B6CFF|8b6cff|FF7A2E|ff7a2e|F472B6|f472b6|FA457B|fa457b)\]|\[var\(--(?:status|accent|success|danger|warning|button-text)[^)]*\)\]|emerald|green|red|rose|amber|yellow))/i;
  
  if (statusRegex.test(className)) {
    return undefined; // Let Tailwind text color class take effect
  }

  // Disabled state: white at 40% opacity
  if (className.includes("opacity-40") || className.includes("disabled")) {
    return "rgba(255, 255, 255, 0.4)";
  }

  // Primary button text/icon: use var(--button-text) (dark in yellow theme)
  if (className.includes("text-[var(--button-text)]") || className.includes("btn-primary-icon")) {
    return "var(--button-text)";
  }

  // Default for all icons: pure white
  return "#FFFFFF";
}

export function Icon({
  name,
  size = 20,
  filled = false,
  className = "",
  style,
  color,
  strokeWidth: _sw,
  ...props
}: IconProps) {
  const resolvedName = ICON_NAME_MAP[name] || name;
  const data = MATERIAL_SYMBOLS_DATA[resolvedName];

  const resolvedColor = getIconColor(className, color, style?.color as string | undefined);
  const mergedStyle = resolvedColor ? { color: resolvedColor, ...style } : style;

  if (!data) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 -960 960 960"
        fill="currentColor"
        className={`shrink-0 inline-block align-middle ${className}`}
        aria-hidden="true"
        style={mergedStyle}
        {...props}
      >
        <path
          d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"
          stroke="currentColor"
          strokeWidth={typeof _sw === "number" ? _sw : 1}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ vectorEffect: "non-scaling-stroke", paintOrder: "stroke fill" }}
        />
      </svg>
    );
  }

  const pathD = filled ? (data.fill || data.outline) : data.outline;
  const effectiveStrokeWidth = typeof _sw === "number" ? _sw : 1;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 -960 960 960"
      fill="currentColor"
      className={`shrink-0 inline-block align-middle ${className}`}
      aria-hidden="true"
      style={mergedStyle}
      {...props}
    >
      <path
        d={pathD}
        stroke="currentColor"
        strokeWidth={effectiveStrokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ vectorEffect: "non-scaling-stroke", paintOrder: "stroke fill" }}
      />
    </svg>
  );
}

export function createIcon(name: string, defaultSize = 20): LucideIcon {
  const IconComponent = React.forwardRef<
    SVGSVGElement,
    React.SVGProps<SVGSVGElement> & {
      size?: number;
      filled?: boolean;
      strokeWidth?: number;
      className?: string;
      color?: string;
      withBackground?: boolean;
    }
  >(({ size = defaultSize, filled, className = "", strokeWidth: _sw, color, withBackground, style, ...props }, ref) => {
    const iconElement = (
      <Icon
        ref={ref as any}
        name={name}
        size={withBackground ? Math.round(size * 0.55) : size}
        filled={filled}
        className={className}
        strokeWidth={_sw}
        style={color ? { color, ...style } : style}
        {...props}
      />
    );

    if (withBackground) {
      return (
        <span
          className="inline-flex items-center justify-center rounded-full shrink-0"
          style={{
            width: size,
            height: size,
            backgroundColor: color ? `${color}20` : "rgba(255,255,255,0.08)",
          }}
        >
          {iconElement}
        </span>
      );
    }

    return iconElement;
  });
  IconComponent.displayName = `Icon(${name})`;
  return IconComponent;
}

// Named Icon exports for complete drop-in replacement
export const AlertCircle = createIcon("AlertCircle");
export const AlertTriangle = createIcon("AlertTriangle");
export const AlignCenter = createIcon("AlignCenter");
export const AlignLeft = createIcon("AlignLeft");
export const AlignRight = createIcon("AlignRight");
export const ArrowLeft = createIcon("ArrowLeft");
export const ArrowRight = createIcon("ArrowRight");
export const ArrowUpDown = createIcon("ArrowUpDown");
export const AtSign = createIcon("AtSign");
export const Bell = createIcon("Bell");
export const Bold = createIcon("Bold");
export const Building2 = createIcon("Building2");
export const Calendar = createIcon("Calendar");
export const Check = createIcon("Check");
export const CheckCircle2 = createIcon("CheckCircle2");
export const CheckSquare = createIcon("CheckSquare");
export const ChevronDown = createIcon("ChevronDown");
export const ChevronLeft = createIcon("ChevronLeft");
export const ChevronRight = createIcon("ChevronRight");
export const ChevronUp = createIcon("ChevronUp");
export const ChevronsUpDown = createIcon("ChevronsUpDown");
export const Circle = createIcon("Circle");
export const Clapperboard = createIcon("Clapperboard");
export const ClipboardList = createIcon("ClipboardList");
export const Clock = createIcon("Clock");
export const Columns = createIcon("Columns");
export const Copy = createIcon("Copy");
export const CornerDownRight = createIcon("CornerDownRight");
export const Database = createIcon("Database");
export const Download = createIcon("Download");
export const Edit = createIcon("Edit");
export const Edit2 = createIcon("Edit2");
export const Edit3 = createIcon("Edit3");
export const ExternalLink = createIcon("ExternalLink");
export const Eye = createIcon("Eye");
export const EyeOff = createIcon("EyeOff");
export const File = createIcon("File");
export const FileAudio = createIcon("FileAudio");
export const FileCode = createIcon("FileCode");
export const FileImage = createIcon("FileImage");
export const FilePlus = createIcon("FilePlus");
export const FileQuestion = createIcon("FileQuestion");
export const FileSpreadsheet = createIcon("FileSpreadsheet");
export const FileText = createIcon("FileText");
export const FileVideo = createIcon("FileVideo");
export const Film = createIcon("Film");
export const Filter = createIcon("Filter");
export const Folder = createIcon("Folder");
export const FolderDown = createIcon("FolderDown");
export const FolderInput = createIcon("FolderInput");
export const FolderOpen = createIcon("FolderOpen");
export const FolderOutput = createIcon("FolderOutput");
export const FolderPlus = createIcon("FolderPlus");
export const FolderUp = createIcon("FolderUp");
export const Heading1 = createIcon("Heading1");
export const Heading2 = createIcon("Heading2");
export const Heading3 = createIcon("Heading3");
export const Highlighter = createIcon("Highlighter");
export const History = createIcon("History");
export const Home = createIcon("Home");
export const Image = createIcon("Image");
export const Info = createIcon("Info");
export const Italic = createIcon("Italic");
export const Layers = createIcon("Layers");
export const LayoutGrid = createIcon("LayoutGrid");
export const Link = createIcon("Link");
export const Link2 = createIcon("Link2");
export const List = createIcon("List");
export const ListOrdered = createIcon("ListOrdered");
export const Loader2 = createIcon("Loader2");
export const Lock = createIcon("Lock");
export const LogOut = createIcon("LogOut");
export const Mail = createIcon("Mail");
export const Maximize2 = createIcon("Maximize2");
export const Menu = createIcon("Menu");
export const MessageSquare = createIcon("MessageSquare");
export const Minimize2 = createIcon("Minimize2");
export const Minus = createIcon("Minus");
export const Moon = createIcon("Moon");
export const MoreHorizontal = createIcon("MoreHorizontal");
export const Move = createIcon("Move");
export const MoveRight = createIcon("MoveRight");
export const Music = createIcon("Music");
export const Palette = createIcon("Palette");
export const PanelLeft = createIcon("PanelLeft");
export const Pause = createIcon("Pause");
export const Pen = createIcon("Pen");
export const Play = createIcon("Play");
export const Plus = createIcon("Plus");
export const Printer = createIcon("Printer");
export const RotateCcw = createIcon("RotateCcw");
export const RotateCw = createIcon("RotateCw");
export const Camera = createIcon("Camera");
export const Search = createIcon("Search");
export const Send = createIcon("Send");
export const Settings = createIcon("Settings");
export const Share2 = createIcon("Share2");
export const Shield = createIcon("Shield");
export const Sliders = createIcon("Sliders");
export const Smartphone = createIcon("Smartphone");
export const Sparkles = createIcon("Sparkles");
export const Square = createIcon("Square");
export const Star = createIcon("Star");
export const Strikethrough = createIcon("Strikethrough");
export const Sun = createIcon("Sun");
export const Table = createIcon("Table");
export const Tag = createIcon("Tag");
export const Trash2 = createIcon("Trash2");
export const Underline = createIcon("Underline");
export const Upload = createIcon("Upload");
export const UploadCloud = createIcon("UploadCloud");
export const User = createIcon("User");
export const UserCheck = createIcon("UserCheck");
export const Users = createIcon("Users");
export const Video = createIcon("Video");
export const Volume2 = createIcon("Volume2");
export const VolumeX = createIcon("VolumeX");
export const X = createIcon("X");
export const Zap = createIcon("Zap");

// Canonical Material Symbol Named Component Exports
export const Close = createIcon("close");
export const Help = createIcon("help");
export const HardDrive = createIcon("hard_drive");
export const CorporateFare = createIcon("corporate_fare");
export const Groups = createIcon("groups");
export const Description = createIcon("description");
export const TableChart = createIcon("table_chart");
export const RateReview = createIcon("rate_review");
export const FolderShared = createIcon("folder_shared");
export const Delete = createIcon("delete");
export const Group = createIcon("group");
export const CreateNewFolder = createIcon("create_new_folder");
export const UploadFile = createIcon("upload_file");
export const DriveFolderUpload = createIcon("drive_folder_upload");
export const PersonAdd = createIcon("person_add");
export const UnfoldMore = createIcon("unfold_more");
export const ChatBubble = createIcon("chat_bubble");
export const Share = createIcon("share");
export const Trash = createIcon("delete");
export const VideoFileIcon = createIcon("movie");
export const ImageFileIcon = createIcon("image");
export const PdfFileIcon = createIcon("description");
export const AudioFileIcon = createIcon("music_note");

export default Icon;

