"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  FloatingFocusManager,
} from "@floating-ui/react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "@/components/ui/icon";

export interface MenuItem {
  id?: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  show?: boolean; // easy permission filter
}

export interface MenuGroup {
  items: MenuItem[];
}

interface MenuProps {
  trigger?: React.ReactNode;
  groups: MenuGroup[];
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "end" | "center";
  className?: string;
}

export function Menu({
  trigger,
  groups,
  isOpen: controlledOpen,
  onOpenChange,
  align = "start",
  className = "",
}: MenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setIsOpen = useCallback(
    (open: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      onOpenChange?.(open);
    },
    [isControlled, onOpenChange]
  );

  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isMobile, setIsMobile] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 640);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: align === "end" ? "bottom-end" : "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({
        fallbackPlacements: [
          "top-start",
          "top-end",
          "bottom-end",
          "left-start",
          "right-start",
        ],
      }),
      shift({ padding: 12 }),
    ],
  });

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    dismiss,
    role,
  ]);

  // Flatten visible items for keyboard navigation
  const visibleItems = groups
    .flatMap((g) => g.items)
    .filter((item) => item.show !== false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % visibleItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev <= 0 ? visibleItems.length - 1 : prev - 1
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const item = visibleItems[activeIndex];
      if (item && !item.disabled && item.onClick) {
        item.onClick();
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  const menuTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: "easeOut" as const };

  const closeTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.1, ease: "easeIn" as const };

  return (
    <>
      {trigger && (
        <div
          ref={refs.setReference}
          {...getReferenceProps({
            onClick: () => setIsOpen(!isOpen),
          })}
          className="inline-flex cursor-pointer"
        >
          {trigger}
        </div>
      )}

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
                  transition={menuTransition}
                  className="relative z-50 w-full rounded-t-xl border-t border-[#2E2F34] bg-[#212121] p-4 shadow-overlay max-h-[85vh] overflow-y-auto"
                >
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#2E2F34]" />
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2E2F34]">
                    <span className="text-xs font-semibold text-[#7C7F87] ">
                      Options
                    </span>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-1 text-[#7C7F87] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {groups.map((group, gIdx) => {
                      const groupItems = group.items.filter(
                        (item) => item.show !== false
                      );
                      if (groupItems.length === 0) return null;
                      return (
                        <div key={gIdx} className={gIdx > 0 ? "pt-2 mt-2 border-t border-[#2E2F34]" : ""}>
                          {groupItems.map((item, iIdx) => (
                            <button
                              key={iIdx}
                              disabled={item.disabled}
                              onClick={() => {
                                if (!item.disabled && item.onClick) {
                                  item.onClick();
                                  setIsOpen(false);
                                }
                              }}
                              className={`flex h-11 w-full items-center justify-between rounded-[10px] px-3 text-sm font-medium transition-colors ${
                                item.disabled
                                  ? "opacity-40 cursor-not-allowed"
                                  : item.danger
                                  ? "text-red-400 active:bg-red-500/10"
                                  : "text-white active:bg-[#2A2B30]"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {item.icon && (
                                  <span className={item.danger ? "text-red-400" : "text-[#A3A6AD]"}>
                                    {item.icon}
                                  </span>
                                )}
                                <span>{item.label}</span>
                              </div>
                              {item.shortcut && (
                                <span className="font-mono text-xs text-[#7C7F87]">
                                  {item.shortcut}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            ) : (
              // Desktop Popper with Flipping & Viewport Protection + Fast Motion Scale
              <FloatingFocusManager context={context} modal={false}>
                <motion.div
                  ref={refs.setFloating}
                  style={floatingStyles}
                  initial={{ opacity: 0, scale: 0.98, y: -2 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -2 }}
                  transition={menuTransition}
                  {...getFloatingProps({
                    onKeyDown: handleKeyDown,
                  })}
                  className={`z-50 w-56 rounded-[10px] border border-[#2E2F34] bg-[#212121] p-1.5 shadow-overlay outline-none max-h-[min(480px,80vh)] overflow-y-auto ${className}`}
                >
                  {groups.map((group, gIdx) => {
                    const groupItems = group.items.filter(
                      (item) => item.show !== false
                    );
                    if (groupItems.length === 0) return null;
                    return (
                      <div
                        key={gIdx}
                        className={
                          gIdx > 0
                            ? "my-1 pt-1 border-t border-[#2E2F34]"
                            : "space-y-0.5"
                        }
                      >
                        {groupItems.map((item, iIdx) => {
                          const globalIndex = visibleItems.indexOf(item);
                          const isFocused = globalIndex === activeIndex;

                          return (
                            <button
                              key={iIdx}
                              disabled={item.disabled}
                              onClick={() => {
                                if (!item.disabled && item.onClick) {
                                  item.onClick();
                                  setIsOpen(false);
                                }
                              }}
                              onMouseEnter={() => setActiveIndex(globalIndex)}
                              className={`flex h-9 w-full items-center justify-between rounded-[8px] px-2.5 text-sm font-normal transition-colors outline-none ${
                                item.disabled
                                  ? "opacity-40 cursor-not-allowed text-[#7C7F87]"
                                  : item.danger
                                  ? isFocused
                                    ? "bg-[#F0506E]/15 text-[#F0506E]"
                                    : "text-[#F0506E] hover:bg-[#F0506E]/10"
                                  : isFocused
                                  ? "bg-[#2C2D33] text-white"
                                  : "text-white hover:bg-[#2C2D33]"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate">
                                {item.icon && (
                                  <span
                                    className={`shrink-0 ${
                                      item.danger
                                        ? "text-[#F0506E]"
                                        : isFocused
                                        ? "text-white"
                                        : "text-[#A3A6AD]"
                                    }`}
                                  >
                                    {item.icon}
                                  </span>
                                )}
                                <span className="truncate">{item.label}</span>
                              </div>
                              {item.shortcut && (
                                <span className="shrink-0 font-mono text-xs text-[#7C7F87] pl-2">
                                  {item.shortcut}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </motion.div>
              </FloatingFocusManager>
            )}
          </FloatingPortal>
        )}
      </AnimatePresence>
    </>
  );
}

// -----------------------------------------------------------------------------
// Unified Context Menu System (Right Click & Touch Long-Press)
// -----------------------------------------------------------------------------

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  groups: MenuGroup[];
}

interface ContextMenuContextValue {
  openContextMenu: (e: React.MouseEvent | { clientX: number; clientY: number }, groups: MenuGroup[]) => void;
  closeContextMenu: () => void;
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null);

export function useContextMenu() {
  const ctx = useContext(ContextMenuContext);
  if (!ctx) {
    throw new Error("useContextMenu must be used within ContextMenuProvider");
  }
  return ctx;
}

export function ContextMenuProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    groups: [],
  });

  const [isMobile, setIsMobile] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    function checkMobile() {
      setIsMobile(window.innerWidth < 640);
    }
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const openContextMenu = useCallback(
    (e: React.MouseEvent | { clientX: number; clientY: number }, groups: MenuGroup[]) => {
      if ("preventDefault" in e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        groups,
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // Floating UI virtual reference
  const virtualElement = {
    getBoundingClientRect() {
      return {
        width: 0,
        height: 0,
        x: state.x,
        y: state.y,
        top: state.y,
        left: state.x,
        right: state.x,
        bottom: state.y,
      };
    },
  };

  const { refs, floatingStyles, context } = useFloating({
    open: state.isOpen,
    onOpenChange: (open) => !open && closeContextMenu(),
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(2),
      flip({
        fallbackPlacements: ["top-start", "bottom-end", "top-end", "left-start"],
      }),
      shift({ padding: 12 }),
    ],
  });

  useEffect(() => {
    if (state.isOpen) {
      refs.setReference(virtualElement as any);
    }
  }, [state.isOpen, state.x, state.y, refs]);

  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const menuTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.16, ease: "easeOut" as const };

  const closeTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.1, ease: "easeIn" as const };

  return (
    <ContextMenuContext.Provider value={{ openContextMenu, closeContextMenu }}>
      {children}

      <AnimatePresence>
        {state.isOpen && (
          <FloatingPortal>
            {isMobile ? (
              <div className="fixed inset-0 z-50 flex flex-col justify-end">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={closeTransition}
                  className="fixed inset-0 bg-black/60"
                  onClick={closeContextMenu}
                />
                <motion.div
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={menuTransition}
                  className="relative z-50 w-full rounded-t-xl border-t border-[#2E2F34] bg-[#212121] p-4 shadow-overlay max-h-[85vh] overflow-y-auto"
                >
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#2E2F34]" />
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#2E2F34]">
                    <span className="text-xs font-semibold text-[#7C7F87] ">
                      Actions
                    </span>
                    <button
                      onClick={closeContextMenu}
                      className="p-1 text-[#7C7F87] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {state.groups.map((group, gIdx) => {
                      const groupItems = group.items.filter((item) => item.show !== false);
                      if (groupItems.length === 0) return null;
                      return (
                        <div key={gIdx} className={gIdx > 0 ? "pt-2 mt-2 border-t border-[#2E2F34]" : ""}>
                          {groupItems.map((item, iIdx) => (
                            <button
                              key={iIdx}
                              disabled={item.disabled}
                              onClick={() => {
                                if (!item.disabled && item.onClick) {
                                  item.onClick();
                                  closeContextMenu();
                                }
                              }}
                              className={`flex h-11 w-full items-center justify-between rounded-[10px] px-3 text-sm font-medium transition-colors ${
                                item.disabled
                                  ? "opacity-40 cursor-not-allowed"
                                  : item.danger
                                  ? "text-red-400 active:bg-red-500/10"
                                  : "text-white active:bg-[#2A2B30]"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {item.icon && (
                                  <span className={item.danger ? "text-red-400" : "text-[#A3A6AD]"}>
                                    {item.icon}
                                  </span>
                                )}
                                <span>{item.label}</span>
                              </div>
                              {item.shortcut && (
                                <span className="font-mono text-xs text-[#7C7F87]">
                                  {item.shortcut}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              </div>
            ) : (
              <FloatingFocusManager context={context} modal={false}>
                <motion.div
                  ref={refs.setFloating}
                  style={floatingStyles}
                  initial={{ opacity: 0, scale: 0.98, y: -2 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -2 }}
                  transition={menuTransition}
                  {...getFloatingProps()}
                  className="z-50 w-56 rounded-[10px] border border-[#2E2F34] bg-[#212121] p-1.5 shadow-overlay outline-none max-h-[min(480px,80vh)] overflow-y-auto"
                >
                  {state.groups.map((group, gIdx) => {
                    const groupItems = group.items.filter((item) => item.show !== false);
                    if (groupItems.length === 0) return null;
                    return (
                      <div
                        key={gIdx}
                        className={
                          gIdx > 0
                            ? "my-1 pt-1 border-t border-[#2E2F34]"
                            : "space-y-0.5"
                        }
                      >
                        {groupItems.map((item, iIdx) => (
                          <button
                            key={iIdx}
                            disabled={item.disabled}
                            onClick={() => {
                              if (!item.disabled && item.onClick) {
                                item.onClick();
                                closeContextMenu();
                              }
                            }}
                            className={`flex h-9 w-full items-center justify-between rounded-[8px] px-2.5 text-sm font-normal transition-colors outline-none ${
                              item.disabled
                                ? "opacity-40 cursor-not-allowed text-[#7C7F87]"
                                : item.danger
                                ? "text-[#F0506E] hover:bg-[#F0506E]/10"
                                : "text-white hover:bg-[#2C2D33]"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              {item.icon && (
                                <span
                                  className={`shrink-0 ${
                                    item.danger ? "text-[#F0506E]" : "text-[#A3A6AD]"
                                  }`}
                                >
                                  {item.icon}
                                </span>
                              )}
                              <span className="truncate">{item.label}</span>
                            </div>
                            {item.shortcut && (
                              <span className="shrink-0 font-mono text-xs text-[#7C7F87] pl-2">
                                {item.shortcut}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </motion.div>
              </FloatingFocusManager>
            )}
          </FloatingPortal>
        )}
      </AnimatePresence>
    </ContextMenuContext.Provider>
  );
}
