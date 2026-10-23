"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Search, X, Users, ChevronDown } from "@/components/ui/icon";
import { Checkbox } from "@/components/ui/checkbox";

export interface ClientOption {
  id: string;
  name: string;
  logo_key?: string | null;
  projects_count?: number;
  [key: string]: any;
}

const CLIENT_COLORS = [
  "#4876f3", // Blue
  "#3fcf8e", // Green
  "#9787ff", // Purple
  "#ffbb56", // Orange
  "#4dd0e1", // Cyan
  "#fa457b", // Pink
  "#ffd43b", // Amber
  "#ba68c8", // Magenta
  "#0e7490", // Teal
  "#7c3aed", // Violet
];

export function getClientColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CLIENT_COLORS[Math.abs(hash) % CLIENT_COLORS.length];
}

interface SelectClientsModalProps {
  open: boolean;
  onClose: () => void;
  selectedClientIds: string[];
  onApply: (clientIds: string[]) => void;
  clients?: ClientOption[];
}

export function SelectClientsModal({
  open,
  onClose,
  selectedClientIds,
  onApply,
  clients: initialClients,
}: SelectClientsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch clients if not provided
  const { data: clientsData } = useQuery<{ clients: ClientOption[] }>({
    queryKey: ["clients-options"],
    queryFn: () => apiRequest<{ clients: ClientOption[] }>("/clients"),
    enabled: open && !initialClients,
  });

  const allClients: ClientOption[] = useMemo(() => {
    const list = initialClients || clientsData?.clients || [];
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [initialClients, clientsData]);

  // Sync tempSelected whenever modal opens
  useEffect(() => {
    if (open) {
      setTempSelected(new Set(selectedClientIds));
      setSearchQuery("");
      setFocusedIndex(-1);
    }
  }, [open, selectedClientIds]);

  // Filter clients by search query (A to Z)
  const filteredClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allClients;
    return allClients.filter((c) => c.name.toLowerCase().includes(q));
  }, [allClients, searchQuery]);

  // Check state for "All clients" row
  const totalCount = allClients.length;
  const isAllSelected = totalCount > 0 && tempSelected.size === totalCount;
  const isPartiallySelected = tempSelected.size > 0 && tempSelected.size < totalCount;
  const isNoneSelected = tempSelected.size === 0;

  function toggleAll() {
    if (isAllSelected) {
      setTempSelected(new Set());
    } else {
      setTempSelected(new Set(allClients.map((c) => c.id)));
    }
  }

  function toggleClient(id: string) {
    setTempSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleClear() {
    setTempSelected(new Set());
  }

  function handleApply() {
    if (isAllSelected || isNoneSelected) {
      // Empty array represents "All clients" (no filtering)
      onApply([]);
    } else {
      onApply(Array.from(tempSelected));
    }
    onClose();
  }

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        handleApply();
        return;
      }

      const totalRows = filteredClients.length + 1; // +1 for "All clients" row

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1 < totalRows ? prev + 1 : 0));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : totalRows - 1));
        return;
      }

      // Space toggles checkbox if focused on a row
      if (e.key === " " && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        if (focusedIndex === 0) {
          toggleAll();
        } else if (focusedIndex > 0 && focusedIndex <= filteredClients.length) {
          const client = filteredClients[focusedIndex - 1];
          if (client) toggleClient(client.id);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, focusedIndex, filteredClients, tempSelected, isAllSelected, isNoneSelected]);

  if (!open || !mounted) return null;

  const selectedCount = tempSelected.size;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150">
      <div
        className="w-[520px] max-w-[95vw] max-h-[85vh] rounded-[16px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-xl overflow-hidden flex flex-col animate-in fade-in duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="select-clients-title"
      >
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 id="select-clients-title" className="text-[18px] font-bold text-white tracking-tight">
                Select clients
              </h2>
              <p className="text-[13px] text-[var(--text-2)] mt-1">
                Show projects from one, several or all clients.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors cursor-pointer -mt-1 -mr-1"
            >
              <X size={20} />
            </button>
          </div>

          {/* Search Box */}
          <div className="mt-4 relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search clients"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setFocusedIndex(-1);
              }}
              className="h-10 w-full pl-9 pr-8 rounded-[10px] bg-[var(--input)] border border-[var(--border)] text-[13px] text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[var(--text-3)] hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* "All clients" Row on its own at top with thin divider */}
        {!searchQuery && (
          <div className="px-6 pt-1 pb-2 shrink-0">
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setFocusedIndex(-1);
                toggleAll();
              }}
              className={`h-12 px-3 rounded-[10px] flex items-center justify-between cursor-pointer transition-colors select-none outline-none ${
                isAllSelected || isPartiallySelected
                  ? "bg-[var(--accent)]/10"
                  : "hover:bg-[var(--hover)]"
              } ${
                focusedIndex === 0
                  ? "ring-2 ring-[var(--accent)]/40"
                  : "focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={isAllSelected ? true : isPartiallySelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  ariaLabel="Select all clients"
                />
                <span className="text-[14px] font-semibold text-white">All clients</span>
              </div>
              <span className="text-[13px] text-[var(--text-3)]">
                {totalCount} {totalCount === 1 ? "client" : "clients"}
              </span>
            </div>
            <div className="mt-2 border-b border-[var(--border)]" />
          </div>
        )}

        {/* Scrollable List */}
        <div ref={listRef} className="px-6 flex-1 overflow-y-auto space-y-1 pb-4 max-h-[380px] custom-scrollbar">
          {/* Client Rows (A to Z) */}
          {filteredClients.map((client, idx) => {
            const isSelected = tempSelected.has(client.id);
            const isInternal = client.name.toLowerCase().includes("idyll");
            const initial = client.name.trim()[0]?.toUpperCase() || "C";
            const initialBg = isInternal ? "#7C3AED" : getClientColor(client.name);
            const projectCount = client.projects_count ?? 0;
            const projectText =
              projectCount === 0
                ? "No projects yet"
                : `${projectCount} ${projectCount === 1 ? "project" : "projects"}`;
            const rowIndex = searchQuery ? idx : idx + 1;
            const isFocused = focusedIndex === rowIndex;

            return (
              <div
                key={client.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setFocusedIndex(-1);
                  toggleClient(client.id);
                }}
                className={`h-12 px-3 rounded-[10px] flex items-center justify-between cursor-pointer transition-colors select-none outline-none ${
                  isSelected
                    ? "bg-[var(--accent)]/10"
                    : "hover:bg-[var(--hover)]"
                } ${
                  isFocused
                    ? "ring-2 ring-[var(--accent)]/40"
                    : "focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                }`}
              >
                <div className="flex items-center gap-3 truncate pr-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleClient(client.id)}
                    ariaLabel={`Select ${client.name}`}
                  />

                  {/* Client Picture or Colored Initials */}
                  <div
                    className="w-7 h-7 rounded-[7px] flex items-center justify-center text-[12px] font-bold text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: initialBg }}
                  >
                    {initial}
                  </div>

                  {/* Name */}
                  <span className="text-[14px] font-medium text-white truncate">
                    {client.name}
                  </span>
                </div>

                {/* Project count & internal indicator */}
                <div className="text-[13px] text-[var(--text-3)] shrink-0 text-right">
                  {isInternal && "internal · "}
                  {projectText}
                </div>
              </div>
            );
          })}

          {filteredClients.length === 0 && (
            <div className="py-8 text-center text-[13px] text-[var(--text-3)]">
              No clients matching &quot;{searchQuery}&quot;
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t border-[var(--border)] flex items-center justify-between bg-[var(--panel-raised)] shrink-0">
          {/* Left: N selected + Clear link */}
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-white">
              {selectedCount} selected
            </span>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[13px] text-[#4876F3] hover:underline font-medium text-left cursor-pointer transition-colors mt-0.5"
              >
                Clear
              </button>
            )}
          </div>

          {/* Right: Cancel + Primary Show Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[14px] font-medium text-[var(--text-2)] hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="h-10 px-5 rounded-[10px] bg-[#4876F3] hover:bg-[#3B67E0] text-white text-[14px] font-semibold transition-colors cursor-pointer shadow-sm"
            >
              {isAllSelected || isNoneSelected
                ? "Show all clients"
                : `Show ${selectedCount} ${selectedCount === 1 ? "client" : "clients"}`}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

interface ClientFilterButtonProps {
  selectedClientIds: string[];
  clients: ClientOption[];
  onClick: () => void;
  onClearAll?: () => void;
  className?: string;
}

/**
 * The Filter Button for Library / Tasks / Documents matching Screenshot L8
 */
export function ClientFilterButton({
  selectedClientIds,
  clients,
  onClick,
  onClearAll,
  className = "",
}: ClientFilterButtonProps) {
  const isFiltered = selectedClientIds.length > 0 && selectedClientIds.length < clients.length;

  const buttonLabel = useMemo(() => {
    if (!isFiltered) {
      return "All clients";
    }

    const selectedClients = clients.filter((c) => selectedClientIds.includes(c.id));
    if (selectedClients.length === 0) return "All clients";

    if (selectedClients.length === 1) {
      return selectedClients[0].name;
    }

    if (selectedClients.length === 2) {
      return `${selectedClients[0].name}, ${selectedClients[1].name}`;
    }

    return `${selectedClients[0].name}, ${selectedClients[1].name} +${selectedClients.length - 2}`;
  }, [isFiltered, selectedClientIds, clients]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="h-9 rounded-[10px] bg-[var(--input)] border border-[var(--border)] hover:border-[var(--border-strong)] px-3 flex items-center gap-2 text-xs text-white transition-colors cursor-pointer select-none"
      >
        <Users size={16} className="text-white shrink-0" />
        <span className="font-medium truncate max-w-[280px]">{buttonLabel}</span>
        {isFiltered && (
          <span className="px-1.5 py-0.5 rounded-full bg-[#4876f3] text-white text-[12px] font-bold shrink-0">
            {selectedClientIds.length}
          </span>
        )}
        <ChevronDown size={16} className="text-[var(--text-3)] shrink-0" />
      </button>

      {isFiltered && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-[#4876F3] hover:underline cursor-pointer transition-colors"
        >
          Show all clients
        </button>
      )}
    </div>
  );
}
