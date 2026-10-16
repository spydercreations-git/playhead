"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  size,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from "@floating-ui/react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, Check, Search, X } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
  icon?: React.ReactNode;
  description?: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select an option...",
  searchable,
  disabled = false,
  className = "",
  triggerClassName = "",
  actionButton,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isMobile, setIsMobile] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 640);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const shouldSearch = searchable ?? options.length > 8;

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: (open) => {
      setIsOpen(open);
      if (!open) {
        setSearch("");
        setActiveIndex(-1);
      }
    },
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ fallbackPlacements: ["top-start", "bottom-end", "top-end"] }),
      shift({ padding: 8 }),
      size({
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, {
            minWidth: `${rects.reference.width}px`,
          });
        },
      }),
    ],
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "listbox" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    dismiss,
    role,
  ]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.group && opt.group.toLowerCase().includes(q))
    );
  }, [options, search]);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  // Grouping
  const groupedOptions = useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const opt of filteredOptions) {
      const g = opt.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(opt);
    }
    return map;
  }, [filteredOptions]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filteredOptions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev <= 0 ? filteredOptions.length - 1 : prev - 1
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const opt = filteredOptions[activeIndex];
      if (opt) {
        onChange(opt.value);
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  useEffect(() => {
    if (isOpen && shouldSearch) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, shouldSearch]);

  const openTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: "easeOut" as const };

  const closeTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.1, ease: "easeIn" as const };

  return (
    <div className={`relative inline-block w-full ${className}`}>
      {/* Trigger Button */}
      <button
        ref={refs.setReference}
        type="button"
        disabled={disabled}
        {...getReferenceProps({
          onClick: () => !disabled && setIsOpen(!isOpen),
        })}
        className={`group relative flex h-10 w-full items-center justify-between rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] pl-3.5 pr-9 text-left text-xs text-white transition-colors focus:outline-none focus:border-[#4876F3] ${
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:border-[#2E2F34]"
        } ${triggerClassName}`}
      >
        <span className="truncate flex items-center gap-2">
          {selectedOption ? (
            <>
              {selectedOption.icon && (
                <span className="shrink-0">{selectedOption.icon}</span>
              )}
              <span className="font-medium text-white truncate">
                {selectedOption.label}
              </span>
            </>
          ) : (
            <span className="text-[#7C7F87] truncate">{placeholder}</span>
          )}
        </span>

        {/* Custom Chevron 12px from right */}
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#7C7F87] transition-transform duration-150 ${
            isOpen ? "rotate-180 text-white" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <FloatingPortal>
            {isMobile ? (
              // Mobile Bottom Sheet
              <div className="fixed inset-0 z-50 flex flex-col justify-end">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={closeTransition}
                  className="fixed inset-0 bg-black/60"
                  onClick={() => setIsOpen(false)}
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={openTransition}
                  className="relative z-50 w-full rounded-t-xl border-t border-[#2E2F34] bg-[#212121] p-4 shadow-overlay max-h-[85vh] overflow-y-auto"
                >
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#424344]" />
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2E2F34]">
                    <span className="text-[13px] font-medium text-[#A3A6AD]">
                      {placeholder}
                    </span>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-1 text-[#7C7F87] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {shouldSearch && (
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7C7F87]" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="w-full h-10 rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] pl-9 pr-3 text-sm text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
                      />
                    </div>
                  )}

                  <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                    {filteredOptions.length === 0 ? (
                      <div className="py-6 text-center text-xs text-[#7C7F87]">
                        No options found.
                      </div>
                    ) : (
                      Array.from(groupedOptions.entries()).map(([grp, opts]) => (
                        <div key={grp} className="mb-2">
                          {grp && (
                            <div className="px-2 py-1 text-[13px] font-medium text-[#A3A6AD]">
                              {grp}
                            </div>
                          )}
                          {opts.map((opt) => {
                            const isSelected = opt.value === value;
                            return (
                              <button
                                key={opt.value}
                                onClick={() => {
                                  onChange(opt.value);
                                  setIsOpen(false);
                                }}
                                className={`flex h-11 w-full items-center justify-between rounded-[10px] px-3 text-sm transition-colors ${
                                  isSelected
                                    ? "bg-[#4876F3]/20 text-[#4876F3] font-semibold"
                                    : "text-white active:bg-[#2A2B30]"
                                }`}
                              >
                                <div className="flex items-center gap-3 truncate">
                                  {opt.icon && (
                                    <span className="shrink-0">{opt.icon}</span>
                                  )}
                                  <span className="truncate">{opt.label}</span>
                                </div>
                                {isSelected && (
                                  <Check className="w-4 h-4 text-[#4876F3] shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>

                  {actionButton && (
                    <div className="pt-3 mt-3 border-t border-[#2E2F34]">
                      <button
                        onClick={() => {
                          actionButton.onClick();
                          setIsOpen(false);
                        }}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] text-xs font-semibold text-[#4876F3] hover:text-white"
                      >
                        {actionButton.icon}
                        <span>{actionButton.label}</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>
            ) : (
              // Desktop Popper
              <FloatingFocusManager context={context} modal={false}>
                <motion.div
                  ref={refs.setFloating}
                  style={floatingStyles}
                  initial={{ opacity: 0, scale: 0.98, y: -2 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -2 }}
                  transition={openTransition}
                  {...getFloatingProps({
                    onKeyDown: handleKeyDown,
                  })}
                  className="z-50 min-w-[200px] max-w-sm rounded-[10px] border border-[#2E2F34] bg-[#212121] p-1.5 shadow-overlay outline-none"
                >
                  {shouldSearch && (
                    <div className="relative mb-1.5 px-1 pt-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#7C7F87]" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search options..."
                        className="w-full h-8 rounded-[8px] bg-[#2A2B30] border border-[#2E2F34] pl-8 pr-3 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
                      />
                    </div>
                  )}

                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {filteredOptions.length === 0 ? (
                      <div className="py-4 text-center text-xs text-[#7C7F87]">
                        No options found.
                      </div>
                    ) : (
                      Array.from(groupedOptions.entries()).map(([grp, opts]) => (
                        <div key={grp}>
                          {grp && (
                            <div className="px-2.5 py-1 text-[13px] font-medium text-[#A3A6AD]">
                              {grp}
                            </div>
                          )}
                          {opts.map((opt) => {
                            const isSelected = opt.value === value;
                            const globalIdx = filteredOptions.indexOf(opt);
                            const isFocused = globalIdx === activeIndex;

                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  onChange(opt.value);
                                  setIsOpen(false);
                                }}
                                onMouseEnter={() => setActiveIndex(globalIdx)}
                                className={`flex h-9 w-full items-center justify-between rounded-[8px] px-2.5 text-xs transition-colors outline-none ${
                                  isSelected
                                    ? "bg-[#4876F3]/15 text-[#4876F3] font-semibold"
                                    : isFocused
                                    ? "bg-[#2A2B30] text-white"
                                    : "text-[#A3A6AD] hover:bg-[#2A2B30] hover:text-white"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  {opt.icon && (
                                    <span className="shrink-0">{opt.icon}</span>
                                  )}
                                  <span className="truncate">{opt.label}</span>
                                </div>
                                {isSelected && (
                                  <Check className="w-3.5 h-3.5 text-[#4876F3] shrink-0" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>

                  {actionButton && (
                    <div className="pt-1.5 mt-1.5 border-t border-[#2E2F34]">
                      <button
                        type="button"
                        onClick={() => {
                          actionButton.onClick();
                          setIsOpen(false);
                        }}
                        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] bg-[#2A2B30] border border-[#2E2F34] text-xs font-medium text-[#4876F3] hover:text-white transition-colors"
                      >
                        {actionButton.icon}
                        <span>{actionButton.label}</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              </FloatingFocusManager>
            )}
          </FloatingPortal>
        )}
      </AnimatePresence>
    </div>
  );
}
