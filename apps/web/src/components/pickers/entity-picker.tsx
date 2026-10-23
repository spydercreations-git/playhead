"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Icon, X, Search, Lock } from "@/components/ui/icon";
import { Checkbox } from "@/components/ui/checkbox";
import { ClientAvatar, UserAvatar } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/api";

export type PickerTab = "clients" | "staff" | "editors" | "client_people";

export interface PickerEntity {
  id: string;
  name: string;
  subtitle?: string;
  email?: string;
  role?: string;
  picture_url?: string;
  project_count?: number;
  is_internal?: boolean;
  client_id?: string;
  client_name?: string;
}

export interface EntityPickerProps {
  isOpen: boolean;
  onClose: () => void;
  tabs?: PickerTab[];
  mode?: "multi" | "single";
  title: string;
  subtitle?: string;
  primaryButtonText?: string | ((selectedCount: number) => string);
  showAll?: boolean;
  disabledIds?: string[];
  disabledReason?: string | ((id: string) => string);
  preselectedIds?: string[];
  context?: string; // project/folder/file/task/document id
  onConfirm: (selectedEntities: PickerEntity[], selectedIds: string[]) => void;
}

const ALL_TABS: Array<{ key: PickerTab; label: string }> = [
  { key: "clients", label: "Clients" },
  { key: "staff", label: "Staff" },
  { key: "editors", label: "Editors" },
  { key: "client_people", label: "Client people" },
];

export function EntityPicker({
  isOpen,
  onClose,
  tabs = ["clients"],
  mode = "single",
  title,
  subtitle,
  primaryButtonText,
  showAll = false,
  disabledIds = [],
  disabledReason = "Already has access",
  preselectedIds = [],
  context,
  onConfirm,
}: EntityPickerProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<PickerTab>(() => {
    return tabs.length > 0 ? tabs[0] : "clients";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [items, setItems] = useState<PickerEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMap, setSelectedMap] = useState<Map<string, PickerEntity>>(new Map());
  const [focusedIndex, setFocusedIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const prevIsOpenRef = useRef(false);
  const preselectedIdsRef = useRef(preselectedIds);
  preselectedIdsRef.current = preselectedIds;

  // Sync activeTab when modal opens
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      if (tabs.length > 0 && !tabs.includes(activeTab)) {
        setActiveTab(tabs[0]);
      }
      setSearchQuery("");
      setFocusedIndex(0);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, tabs, activeTab]);

  // Load items from /api/v1/pickers with debounce and cancellation
  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams({
          tab: activeTab,
          q: searchQuery.trim(),
          limit: "100",
        });
        if (context) {
          queryParams.set("context", context);
        }
        const res = await apiRequest<{ items: PickerEntity[]; total: number }>(
          `/pickers?${queryParams.toString()}`
        );
        if (!active) return;
        const fetched = res.items || [];
        setItems(fetched);

        // Prepopulate selectedMap with preselected entities if matching
        const preselected = preselectedIdsRef.current;
        if (preselected && preselected.length > 0) {
          setSelectedMap((prev) => {
            const next = new Map(prev);
            for (const item of fetched) {
              if (preselected.includes(item.id) && !next.has(item.id)) {
                next.set(item.id, item);
              }
            }
            return next;
          });
        }
      } catch (err) {
        if (!active) return;
        console.error("Failed to load picker entities:", err);
        setItems([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 150);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, activeTab, searchQuery, context]);

  // Focus search box on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, activeTab]);

  const disabledSet = useMemo(() => new Set(disabledIds), [disabledIds]);

  const getReasonForId = useCallback(
    (id: string) => {
      if (typeof disabledReason === "function") {
        return disabledReason(id);
      }
      return disabledReason;
    },
    [disabledReason]
  );

  const handleToggleRow = (entity: PickerEntity) => {
    if (disabledSet.has(entity.id)) return;

    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (mode === "single") {
        if (next.has(entity.id)) {
          next.clear();
        } else {
          next.clear();
          next.set(entity.id, entity);
        }
      } else {
        if (next.has(entity.id)) {
          next.delete(entity.id);
        } else {
          next.set(entity.id, entity);
        }
      }
      return next;
    });
  };

  const handleRemoveTag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedMap((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const handleClearAll = () => {
    setSelectedMap(new Map());
  };

  // "All clients" mixed state calculation
  const totalSelectableCount = useMemo(() => {
    return items.filter((item) => !disabledSet.has(item.id)).length;
  }, [items, disabledSet]);

  const isAllSelected = useMemo(() => {
    if (totalSelectableCount === 0) return false;
    return items.every((item) => disabledSet.has(item.id) || selectedMap.has(item.id));
  }, [items, selectedMap, disabledSet, totalSelectableCount]);

  const isSomeSelected = useMemo(() => {
    if (isAllSelected) return false;
    return items.some((item) => selectedMap.has(item.id));
  }, [items, selectedMap, isAllSelected]);

  const handleToggleAll = () => {
    if (isAllSelected) {
      setSelectedMap(new Map());
    } else {
      const next = new Map<string, PickerEntity>();
      for (const item of items) {
        if (!disabledSet.has(item.id)) {
          next.set(item.id, item);
        }
      }
      setSelectedMap(next);
    }
  };

  const handleConfirm = () => {
    const selectedEntities = Array.from(selectedMap.values());
    const selectedIds = Array.from(selectedMap.keys());
    onConfirm(selectedEntities, selectedIds);
    onClose();
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedMap.size > 0 || (showAll && isAllSelected)) {
        handleConfirm();
      } else if (items[focusedIndex]) {
        handleToggleRow(items[focusedIndex]);
      }
      return;
    }
  };

  if (!isOpen || !mounted) return null;

  const selectedCount = selectedMap.size;
  const primaryText =
    typeof primaryButtonText === "function"
      ? primaryButtonText(selectedCount)
      : primaryButtonText || (mode === "single" ? "Continue" : selectedCount > 0 ? `Select (${selectedCount})` : "Confirm");

  const searchPlaceholder =
    activeTab === "clients"
      ? "Search clients"
      : activeTab === "staff"
      ? "Search staff"
      : activeTab === "editors"
      ? "Search editors"
      : "Search client people";

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="relative w-[520px] max-w-[95vw] rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex flex-col pr-4">
            <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
            {subtitle && <p className="text-sm text-[var(--text-2)] mt-0.5">{subtitle}</p>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors shrink-0"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs Row */}
        <div className="flex items-center gap-1.5 px-6 pb-4 overflow-x-auto no-scrollbar">
          {ALL_TABS.map((t) => {
            const isAllowed = tabs.includes(t.key);
            const isCurrent = activeTab === t.key;

            if (isAllowed) {
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(t.key);
                    setSearchQuery("");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isCurrent
                      ? "bg-[var(--hover)] text-white"
                      : "text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)]/50"
                  }`}
                >
                  {t.label}
                </button>
              );
            }

            return (
              <div
                key={t.key}
                title="Not available here"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[var(--text-3)] cursor-not-allowed select-none opacity-60"
              >
                <span>{t.label}</span>
                <Lock size={14} className="shrink-0 text-[var(--text-3)]" />
              </div>
            );
          })}
        </div>

        {/* Search Box */}
        <div className="px-6 pb-3">
          <div className="relative flex items-center">
            <Search size={18} className="absolute left-3 text-[var(--text-3)] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full h-10 pl-9 pr-8 rounded-lg bg-[var(--input)] border border-[var(--border)] text-sm text-white placeholder:text-[var(--text-3)] focus:border-[var(--accent)] outline-none transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 p-1 text-[var(--text-3)] hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Removable Tags (Multi mode only) */}
        {mode === "multi" && selectedMap.size > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3 max-h-[80px] overflow-y-auto">
            {Array.from(selectedMap.values()).map((entity) => (
              <div
                key={entity.id}
                className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md bg-[var(--hover)] border border-[var(--border)] text-xs text-white"
              >
                {activeTab === "clients" ? (
                  <ClientAvatar
                    id={entity.id}
                    name={entity.name}
                    pictureUrl={entity.picture_url}
                    size={16}
                  />
                ) : (
                  <UserAvatar
                    id={entity.id}
                    name={entity.name}
                    email={entity.email}
                    avatarUrl={entity.picture_url}
                    size={16}
                  />
                )}
                <span className="max-w-[120px] truncate">{entity.name}</span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveTag(entity.id, e)}
                  className="p-0.5 text-[var(--text-3)] hover:text-white transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* "All clients" row (Only when showAll is true and activeTab is clients) */}
        {showAll && activeTab === "clients" && !searchQuery && (
          <div className="px-6 pb-2">
            <div
              onClick={handleToggleAll}
              className={`flex items-center justify-between h-[50px] px-3.5 rounded-[10px] cursor-pointer transition-colors duration-150 ${
                isAllSelected
                  ? "bg-[var(--accent)]/10"
                  : "hover:bg-[var(--hover)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={isAllSelected}
                  indeterminate={isSomeSelected}
                  onChange={handleToggleAll}
                />
                <span className="text-sm font-semibold text-white">All clients</span>
              </div>
              <span className="text-xs text-[var(--text-3)]">
                {items.length} {items.length === 1 ? "client" : "clients"}
              </span>
            </div>
            <div className="h-px bg-[var(--border)] my-2" />
          </div>
        )}

        {/* Scrollable Entity List */}
        <div
          ref={listContainerRef}
          className="flex-1 overflow-y-auto px-6 space-y-1 min-h-[200px] max-h-[340px]"
        >
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text-3)]">
              Loading...
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-[var(--text-3)]">
              <span>No {activeTab.replace("_", " ")} found</span>
              {searchQuery && <span className="text-xs mt-1">Try another search term</span>}
            </div>
          ) : (
            items.map((entity, index) => {
              const isSelected = selectedMap.has(entity.id);
              const isDisabled = disabledSet.has(entity.id);
              const reason = isDisabled ? getReasonForId(entity.id) : null;
              const isFocused = focusedIndex === index;

              return (
                <div
                  key={entity.id}
                  onClick={() => handleToggleRow(entity)}
                  className={`group flex items-center justify-between h-[50px] px-3.5 rounded-[10px] transition-colors duration-150 select-none ${
                    isDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : isSelected
                      ? "bg-[var(--accent)]/10 cursor-pointer"
                      : isFocused
                      ? "bg-[var(--hover)] cursor-pointer"
                      : "hover:bg-[var(--hover)] cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Checkbox
                      checked={isSelected}
                      disabled={isDisabled}
                      onChange={() => handleToggleRow(entity)}
                    />

                    {activeTab === "clients" ? (
                      <ClientAvatar
                        id={entity.id}
                        name={entity.name}
                        pictureUrl={entity.picture_url}
                        size={32}
                      />
                    ) : (
                      <UserAvatar
                        id={entity.id}
                        name={entity.name}
                        email={entity.email}
                        avatarUrl={entity.picture_url}
                        size={32}
                      />
                    )}

                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium text-white truncate">
                        {entity.name}
                      </span>
                      <span className="text-xs text-[var(--text-3)] truncate">
                        {isDisabled && reason ? reason : entity.subtitle}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-[var(--panel)] shrink-0 mt-2">
          <div className="flex items-center gap-2">
            {mode === "multi" && (
              <>
                <span className="text-xs text-[var(--text-3)]">
                  {selectedCount} selected
                </span>
                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-xs text-[var(--accent)] hover:underline ml-1 font-medium"
                  >
                    Clear
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-2)] hover:text-white hover:bg-[var(--hover)] transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={mode === "single" ? selectedCount === 0 : false}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {primaryText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
