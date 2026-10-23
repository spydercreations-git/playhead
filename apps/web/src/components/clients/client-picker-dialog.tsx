"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { Search, X, Check, ArrowLeft, ChevronDown } from "@/components/ui/icon";

export interface ClientItem {
  id: string;
  name: string;
  website?: any;
  logo_key?: any;
  projects_count?: number;
}

interface ClientPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedClientId?: string;
  onSelectClient: (client: ClientItem | null) => void;
  title?: string;
  confirmLabel?: string;
}

export function ClientPickerDialog({
  isOpen,
  onClose,
  selectedClientId,
  onSelectClient,
  title = "Select client",
  confirmLabel = "Show projects",
}: ClientPickerDialogProps) {
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [pendingSelectedId, setPendingSelectedId] = useState<string>(selectedClientId || "");
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery<{ clients: ClientItem[] }>({
    queryKey: ["clients-picker-list"],
    queryFn: () => apiRequest<{ clients: ClientItem[] }>("/clients"),
    enabled: isOpen,
  });

  const clients: ClientItem[] = useMemo(() => {
    const list = data?.clients || [];
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clients;
    const term = search.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(term));
  }, [clients, search]);

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setPendingSelectedId(selectedClientId || "");
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, selectedClientId]);

  // Reset highlight index when filtered results change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredClients]);

  // Keyboard navigation: ArrowUp, ArrowDown, Enter, Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredClients.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredClients[highlightedIndex]) {
          const chosen = filteredClients[highlightedIndex];
          onSelectClient(chosen);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredClients, highlightedIndex, onClose, onSelectClient]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current) {
      const activeElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex]);

  if (!isOpen) return null;

  function handleConfirm() {
    const chosen = clients.find((c) => c.id === pendingSelectedId) || null;
    onSelectClient(chosen);
    onClose();
  }

  function handleClear() {
    onSelectClient(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150">
      <div className="w-full max-w-[480px] rounded-[16px] border border-[var(--border)] bg-[var(--panel)] shadow-overlay flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-bold text-white">{title}</h2>
            <p className="text-xs text-[var(--text-2)] mt-0.5">
              Choose a client from your workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[8px] text-[var(--text-3)] hover:text-white hover:bg-[var(--input)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Filter */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--panel-raised)]">
          <div className="flex items-center h-10 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs text-[var(--text-2)] focus-within:border-[#4876F3] transition-colors">
            <Search className="w-4 h-4 text-[var(--text-3)] shrink-0 mr-2.5" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients by name..."
              className="w-full bg-transparent text-xs text-white placeholder-[var(--text-3)] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="text-[var(--text-3)] hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Clients List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[360px]"
        >
          {isLoading ? (
            <div className="p-8 text-center text-xs text-[var(--text-3)]">
              Loading clients...
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--text-3)]">
              No clients found matching &ldquo;{search}&rdquo;.
            </div>
          ) : (
            filteredClients.map((client, idx) => {
              const isSelected = client.id === pendingSelectedId;
              const isHighlighted = idx === highlightedIndex;

              const logoUrl =
                typeof client.logo_key === "string"
                  ? client.logo_key
                  : client.logo_key?.String || null;

              return (
                <div
                  key={client.id}
                  onClick={() => {
                    setPendingSelectedId(client.id);
                    setHighlightedIndex(idx);
                  }}
                  onDoubleClick={() => {
                    onSelectClient(client);
                    onClose();
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-[10px] cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-[var(--accent)]/15 border border-[var(--accent)]/40 text-white"
                      : isHighlighted
                      ? "bg-[var(--hover)] text-white border border-transparent"
                      : "text-white border border-transparent hover:bg-[var(--hover)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-[8px] bg-[#0e7490] flex items-center justify-center shrink-0 overflow-hidden font-bold text-xs text-white">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={client.name}
                          className="w-full h-full object-cover rounded-[8px]"
                        />
                      ) : (
                        client.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">
                        {client.name}
                      </div>
                      {typeof client.projects_count === "number" && (
                        <div className="text-xs text-[var(--text-3)]">
                          {client.projects_count}{" "}
                          {client.projects_count === 1 ? "project" : "projects"}
                        </div>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--accent)] text-white">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-[var(--panel)]">
          <div>
            {selectedClientId && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-[var(--text-3)] hover:text-white transition-colors"
              >
                Clear filter (All clients)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-white rounded-[10px] hover:bg-[var(--hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!pendingSelectedId}
              className="h-9 px-4 rounded-[10px] bg-[var(--button)] text-xs font-semibold text-[var(--button-text)] shadow hover:bg-[var(--button-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable toolbar trigger button for the Client Picker
 * Shows "Select client ▾" or "← Back to all clients" when filtered.
 */
interface ClientPickerTriggerProps {
  selectedClient?: { id: string; name: string } | null;
  onOpenPicker: () => void;
  onClearSelection: () => void;
  className?: string;
}

export function ClientPickerTrigger({
  selectedClient,
  onOpenPicker,
  onClearSelection,
  className = "",
}: ClientPickerTriggerProps) {
  if (selectedClient) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <button
          type="button"
          onClick={onClearSelection}
          className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-2)] hover:text-white hover:border-[var(--border-strong)] transition-colors"
          title="Back to all clients"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to all clients</span>
        </button>
        <button
          type="button"
          onClick={onOpenPicker}
          className="flex h-9 items-center gap-2 rounded-[10px] bg-[var(--accent)]/15 border border-[var(--accent)]/40 px-3 text-xs font-semibold text-white hover:bg-[var(--accent)]/25 transition-colors"
        >
          <div className="w-4 h-4 rounded-[6px] bg-[#0e7490] flex items-center justify-center text-xs font-bold text-white">
            {selectedClient.name.charAt(0).toUpperCase()}
          </div>
          <span>{selectedClient.name}</span>
          <ChevronDown className="w-4 h-4 text-[var(--text-2)]" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenPicker}
      className={`flex h-9 items-center gap-2 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-2)] hover:text-white hover:border-[var(--border-strong)] transition-colors ${className}`}
    >
      <span>Select client</span>
      <ChevronDown className="w-4 h-4 text-[var(--text-3)]" />
    </button>
  );
}
