"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, Folder, ChevronRight, ChevronDown, Check } from "lucide-react";

interface FolderItem {
  id: string;
  name: string;
  parent_id?: string | null;
  children?: FolderItem[];
}

interface MoveCopyPanelProps {
  isOpen: boolean;
  mode: "move" | "copy";
  itemCount: number;
  clientName: string;
  projectName: string;
  folders: FolderItem[];
  onClose: () => void;
  onConfirm: (targetFolderId: string | null) => void;
  isLoading?: boolean;
}

export function MoveCopyPanel({
  isOpen,
  mode,
  itemCount,
  clientName,
  projectName,
  folders,
  onClose,
  onConfirm,
  isLoading = false,
}: MoveCopyPanelProps) {
  // selectedTarget: null represents "Files" (project root)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null | undefined>(undefined);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const title = mode === "move" ? "Move to" : "Copy to";
  const actionButtonText =
    mode === "move"
      ? `Move ${itemCount} ${itemCount === 1 ? "item" : "items"}`
      : `Copy ${itemCount} ${itemCount === 1 ? "item" : "items"}`;

  const isDestinationChosen = selectedTargetId !== undefined;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolderIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const renderFolderNode = (folder: FolderItem, depth = 0) => {
    const isExpanded = expandedFolderIds.includes(folder.id);
    const isSelected = selectedTargetId === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id} className="select-none">
        <div
          onClick={() => setSelectedTargetId(folder.id)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className={`flex items-center justify-between py-1.5 pr-2 rounded-lg cursor-pointer transition-colors text-xs ${
            isSelected
              ? "bg-[#4876F3]/20 text-[#4876F3] font-semibold"
              : "text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white"
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(folder.id, e)}
                className="p-0.5 text-[#7C7F87] hover:text-white"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            ) : (
              <span className="w-4" />
            )}
            <Folder className={`w-3.5 h-3.5 ${isSelected ? "text-[#4876F3]" : "text-amber-400"}`} />
            <span className="truncate">{folder.name}</span>
          </div>

          {isSelected && <Check className="w-3 h-3 text-[#4876F3] shrink-0" />}
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-0.5">
            {folder.children!.map((child) => renderFolderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="absolute bottom-0 left-0 right-0 max-h-[75%] rounded-t-xl border-t border-x border-[#2E2F34] bg-[#212121] shadow-overlay flex flex-col z-40 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2E2F34]">
        <h4 className="text-xs font-bold text-white">{title}</h4>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Current Client / Project Location */}
      <div className="px-4 py-2 border-b border-[#2E2F34] bg-[#181818] flex items-center gap-2 text-[11px] text-[#A3A6AD]">
        <ArrowLeft className="w-3 h-3 text-[#7C7F87]" />
        <span className="truncate text-white font-medium">
          {clientName} / {projectName}
        </span>
      </div>

      {/* Folder Tree Scrollable Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1 max-h-56">
        {/* Project Root: "Files" */}
        <div
          onClick={() => setSelectedTargetId(null)}
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
            selectedTargetId === null
              ? "bg-[#4876F3]/20 text-[#4876F3] font-semibold"
              : "text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white"
          }`}
        >
          <div className="flex items-center gap-2">
            <Folder className={`w-3.5 h-3.5 ${selectedTargetId === null ? "text-[#4876F3]" : "text-amber-400"}`} />
            <span>Files (Project Root)</span>
          </div>
          {selectedTargetId === null && <Check className="w-3 h-3 text-[#4876F3] shrink-0" />}
        </div>

        {/* Tree Nodes */}
        {folders.map((folder) => renderFolderNode(folder))}
      </div>

      {/* Bottom Action Button */}
      <div className="p-3 border-t border-[#2E2F34] bg-[#181818]">
        <button
          type="button"
          disabled={!isDestinationChosen || isLoading}
          onClick={() => {
            if (isDestinationChosen) {
              onConfirm(selectedTargetId ?? null);
            }
          }}
          className={`w-full h-8 rounded-lg text-xs font-semibold text-white transition-all shadow flex items-center justify-center ${
            isDestinationChosen && !isLoading
              ? "bg-[#3B67E0] hover:bg-[#4876F3] cursor-pointer"
              : "bg-[#2E2F34] text-[#7C7F87] cursor-not-allowed"
          }`}
        >
          {isLoading ? "Processing..." : actionButtonText}
        </button>
      </div>
    </motion.div>
  );
}
