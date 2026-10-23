"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Globe,
  Check,
  ChevronDown,
  Search,
  Clock,
} from "@/components/ui/icon";
import {
  MAIN_TIMEZONES,
  getDetectedTimezone,
  getTimezoneOffsetString,
  getTimezoneAbbr,
  formatTimezoneBadge,
  TimezoneItem,
} from "@/lib/timezone";

interface TimezoneSelectProps {
  value: string; // "autodetect" or IANA name like "America/Los_Angeles"
  onChange: (tz: string) => void;
  variant?: "default" | "compact";
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function TimezoneSelect({
  value,
  onChange,
  variant = "default",
  className = "",
  placeholder = "Select timezone",
  disabled = false,
  isOpen: controlledIsOpen,
  onOpenChange,
}: TimezoneSelectProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = typeof controlledIsOpen === "boolean";
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const setOpen = (next: boolean) => {
    if (isControlled && onOpenChange) {
      onOpenChange(next);
    } else {
      setInternalIsOpen(next);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const detectedTz = useMemo(() => getDetectedTimezone(), []);
  const detectedOffset = useMemo(
    () => getTimezoneOffsetString(detectedTz),
    [detectedTz]
  );
  const detectedAbbr = useMemo(
    () => getTimezoneAbbr(detectedTz),
    [detectedTz]
  );

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  // Filtered timezone items
  const filteredTimezones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return MAIN_TIMEZONES;
    return MAIN_TIMEZONES.filter(
      (tz) =>
        tz.id.toLowerCase().includes(q) ||
        tz.label.toLowerCase().includes(q) ||
        tz.cities.toLowerCase().includes(q) ||
        tz.region.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Group by region
  const groupedTimezones = useMemo(() => {
    const groups: Record<string, TimezoneItem[]> = {};
    for (const item of filteredTimezones) {
      if (!groups[item.region]) {
        groups[item.region] = [];
      }
      groups[item.region].push(item);
    }
    return groups;
  }, [filteredTimezones]);

  // Current display text
  const currentLabel = useMemo(() => {
    if (value === "autodetect") {
      const badge = formatTimezoneBadge(detectedTz);
      return `Autodetect (${detectedTz} · ${badge})`;
    }
    const found = MAIN_TIMEZONES.find((t) => t.id === value);
    const badge = formatTimezoneBadge(value);
    if (found) {
      return `${found.label} (${badge})`;
    }
    return `${value} (${badge})`;
  }, [value, detectedTz]);

  const compactLabel = useMemo(() => {
    if (value === "autodetect") {
      const badge =
        !detectedAbbr ||
        detectedAbbr === detectedOffset ||
        detectedAbbr.startsWith("GMT") ||
        detectedAbbr.startsWith("UTC")
          ? detectedOffset
          : detectedAbbr;
      return `Auto (${badge})`;
    }
    const abbr = getTimezoneAbbr(value);
    const offset = getTimezoneOffsetString(value);
    return !abbr || abbr === offset || abbr.startsWith("GMT") || abbr.startsWith("UTC")
      ? offset
      : abbr;
  }, [value, detectedAbbr, detectedOffset]);

  function handleSelect(tzId: string) {
    onChange(tzId);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      {variant === "compact" ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!isOpen)}
          className={`h-8 px-2.5 rounded-[8px] bg-[var(--input)] border flex items-center gap-1.5 text-[13px] text-white transition-colors cursor-pointer select-none whitespace-nowrap shrink-0 ${
            isOpen
              ? "border-[#4876F3] ring-1 ring-[#4876F3]"
              : "border-[var(--border)] hover:border-[var(--border-strong)]"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          title={currentLabel}
        >
          <Globe size={16} className="text-[#4876F3] shrink-0" />
          <span className="font-medium text-white whitespace-nowrap truncate max-w-[130px]">
            {compactLabel}
          </span>
          <ChevronDown size={16} className="text-[var(--text-3)] shrink-0" />
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!isOpen)}
          className={`h-11 w-full rounded-[10px] bg-[var(--input)] border px-3.5 flex items-center justify-between text-[14px] text-white transition-all text-left select-none ${
            isOpen
              ? "border-[#4876F3] ring-1 ring-[#4876F3]"
              : "border-[var(--border)] hover:border-[var(--border-strong)]"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className="flex items-center gap-2.5 truncate">
            <Globe size={16} className="text-[#4876F3] shrink-0" />
            <span className="text-white truncate font-medium">
              {currentLabel || placeholder}
            </span>
          </div>
          <ChevronDown size={16} className="text-[var(--text-3)] shrink-0" />
        </button>
      )}

      {/* Connected Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute z-50 rounded-[12px] bg-[#161618] border border-[var(--border)] p-2 shadow-xl animate-in fade-in duration-100 ${
            variant === "compact"
              ? "bottom-full mb-1.5 right-0 w-80 max-w-[90vw]"
              : "top-full mt-1.5 left-0 w-full"
          }`}
        >
          {/* Search Bar */}
          <div className="relative mb-2 px-1">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search city, country, or timezone..."
              className="w-full h-8 pl-8 pr-3 rounded-[8px] bg-[var(--input)] border border-[var(--border)] text-[13px] text-white placeholder-[var(--text-3)] outline-none focus:border-[#4876F3]"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-3 px-1 custom-scrollbar">
            {/* Autodetect Option */}
            <div>
              <button
                type="button"
                onClick={() => handleSelect("autodetect")}
                className={`w-full px-2.5 py-2 rounded-[8px] flex items-center justify-between text-left transition-colors cursor-pointer ${
                  value === "autodetect"
                    ? "bg-[#4876F3] text-white"
                    : "text-white hover:bg-[var(--hover)]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Globe
                    size={16}
                    className={
                      value === "autodetect" ? "text-white" : "text-[#4876F3]"
                    }
                  />
                  <div className="truncate">
                    <div className="text-[13px] font-semibold truncate flex items-center gap-1.5">
                      <span>Autodetect</span>
                      <span
                        className={`text-[12px] px-1.5 py-0.2 rounded-full font-normal ${
                          value === "autodetect"
                            ? "bg-white/20 text-white"
                            : "bg-[var(--input)] text-[var(--text-2)]"
                        }`}
                      >
                        System
                      </span>
                    </div>
                    <div
                      className={`text-[12px] truncate ${
                        value === "autodetect"
                          ? "text-white/80"
                          : "text-[var(--text-3)]"
                      }`}
                    >
                      {detectedTz} · {detectedOffset} ({detectedAbbr})
                    </div>
                  </div>
                </div>
                {value === "autodetect" && (
                  <Check size={16} className="text-white shrink-0 ml-2" />
                )}
              </button>
            </div>

            {/* Grouped Timezone Lists */}
            {Object.keys(groupedTimezones).map((region) => (
              <div key={region} className="space-y-1">
                <div className="px-2 text-[12px] font-medium text-[var(--text-3)]">
                  {region}
                </div>
                {groupedTimezones[region].map((tz) => {
                  const isSelected = value === tz.id;
                  const offset = getTimezoneOffsetString(tz.id);
                  const abbr = getTimezoneAbbr(tz.id);
                  return (
                    <button
                      key={tz.id}
                      type="button"
                      onClick={() => handleSelect(tz.id)}
                      className={`w-full px-2.5 py-1.5 rounded-[8px] flex items-center justify-between text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#4876F3] text-white"
                          : "text-white hover:bg-[var(--hover)]"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="text-[13px] font-medium truncate flex items-center gap-1.5">
                          <span>{tz.label}</span>
                          <span
                            className={`text-[12px] ${
                              isSelected
                                ? "text-white/80"
                                : "text-[var(--text-3)]"
                            }`}
                          >
                            {offset}
                          </span>
                        </div>
                        <div
                          className={`text-[12px] truncate ${
                            isSelected
                              ? "text-white/80"
                              : "text-[var(--text-3)]"
                          }`}
                        >
                          {tz.cities}
                        </div>
                      </div>
                      {isSelected && (
                        <Check
                          size={16}
                          className="text-white shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {filteredTimezones.length === 0 && (
              <div className="py-6 text-center text-[13px] text-[var(--text-3)]">
                No matching timezones found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
