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

  // Close on any window / container scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleScroll = () => {
      setIsOpen(false);
    };
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [isOpen, setIsOpen]);

  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: align === "end" ? "bottom-end" : "bottom-start",
    strategy: "fixed",
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({
        fallbackPlacements: [
          align === "end" ? "top-end" : "top-start",
          align === "end" ? "bottom-start" : "bottom-end",
          "top-start",
          "top-end",
        ],
      }),
      shift({ padding: 8 }),
    ],
  });

  const dismiss = useDismiss(context, {
    outsidePress: true,
    escapeKey: true,
    ancestorScroll: true,
  });
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
    : { duration: 0.14, ease: "easeOut" as const };

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
                  className="relative z-50 w-full rounded-t-xl border-t border-[var(--border)] bg-[var(--panel)] p-4 shadow-overlay max-h-[85vh] overflow-y-auto"
                >
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
                    <span className="text-xs font-semibold text-[var(--text-3)] ">
                      Options
                    </span>
                    <button
                      onClick={() => setIsOpen(false)}
                      className="p-1 text-[var(--text-3)] hover:text-white"
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
                        <div key={gIdx} className={gIdx > 0 ? "pt-2 mt-2 border-t border-[var(--border)]" : ""}>
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
                                  : "text-white active:bg-[var(--input)]"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {item.icon && (
                                  <span className={item.danger ? "text-red-400" : "text-[var(--text-2)]"}>
                                    {item.icon}
                                  </span>
                                )}
                                <span>{item.label}</span>
                              </div>
                              {item.shortcut && (
                                <span className="font-mono text-xs text-[var(--text-3)]">
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
                  style={{
                    ...floatingStyles,
                    visibility: isPositioned ? "visible" : "hidden",
                  }}
                  initial={{ opacity: 0, scale: 0.98, y: -2 }}
                  animate={{ opacity: isPositioned ? 1 : 0, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -2 }}
                  transition={menuTransition}
                  data-testid="dropdown-menu"
                  {...getFloatingProps({
                    onKeyDown: handleKeyDown,
                  })}
                  className={`z-50 w-56 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-overlay outline-none max-h-[min(480px,80vh)] overflow-y-auto ${className}`}
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
                            ? "my-1 pt-1 border-t border-[var(--border)]"
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
                                  ? "opacity-40 cursor-not-allowed text-[var(--text-3)]"
                                  : item.danger
                                  ? isFocused
                                    ? "bg-[#F0506E]/15 text-[#F0506E]"
                                    : "text-[#F0506E] hover:bg-[#F0506E]/10"
                                  : isFocused
                                  ? "bg-[var(--hover)] text-white"
                                  : "text-white hover:bg-[var(--hover)]"
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
                                        : "text-[var(--text-2)]"
                                    }`}
                                  >
                                    {item.icon}
                                  </span>
                                )}
                                <span className="truncate">{item.label}</span>
                              </div>
                              {item.shortcut && (
                                <span className="shrink-0 font-mono text-xs text-[var(--text-3)] pl-2">
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
// Unified Context Menu System (Right Click & ⋯ Button Anchor)
// -----------------------------------------------------------------------------

export interface ContextMenuState {
  isOpen: boolean;
  domReference: HTMLElement | null;
  positionReference: any;
  placement: "bottom-end" | "bottom-start";
  groups: MenuGroup[];
}

interface ContextMenuContextValue {
  openContextMenu: (
    e:
      | React.MouseEvent
      | React.TouchEvent
      | HTMLElement
      | { clientX: number; clientY: number }
      | any,
    groups: MenuGroup[]
  ) => void;
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
    domReference: null,
    positionReference: null,
    placement: "bottom-end",
    groups: [],
  });

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

  const closeContextMenu = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
    setActiveIndex(-1);
  }, []);

  const openContextMenu = useCallback(
    (
      target:
        | React.MouseEvent
        | React.TouchEvent
        | HTMLElement
        | { clientX: number; clientY: number }
        | any,
      groups: MenuGroup[]
    ) => {
      if (target && typeof target === "object" && "preventDefault" in target) {
        try {
          target.preventDefault?.();
          target.stopPropagation?.();
        } catch {}
      }

      let domReference: HTMLElement | null = null;
      let positionReference: any = null;
      let placement: "bottom-end" | "bottom-start" = "bottom-end";

      if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) {
        // Direct HTMLElement passed (e.g. ⋯ button)
        domReference = target;
        positionReference = target;
        placement = "bottom-end";
      } else if (
        target &&
        typeof target === "object" &&
        target.currentTarget instanceof HTMLElement &&
        target.type !== "contextmenu"
      ) {
        // Click event on a button / element
        domReference = target.currentTarget;
        positionReference = target.currentTarget;
        placement = "bottom-end";
      } else if (
        target &&
        typeof target === "object" &&
        target.target instanceof HTMLElement &&
        target.type !== "contextmenu"
      ) {
        // Target element or its closest button
        const btn = target.target.closest("button") || target.target;
        domReference = btn;
        positionReference = btn;
        placement = "bottom-end";
      } else if (
        target &&
        typeof target === "object" &&
        typeof target.clientX === "number" &&
        typeof target.clientY === "number"
      ) {
        // Right-click contextmenu event or touch coordinate
        const x = target.clientX;
        const y = target.clientY;
        const fallbackDom =
          target.currentTarget instanceof HTMLElement
            ? target.currentTarget
            : target.target instanceof HTMLElement
            ? target.target
            : typeof document !== "undefined"
            ? document.body
            : null;

        domReference = fallbackDom;
        positionReference = {
          getBoundingClientRect() {
            return {
              width: 0,
              height: 0,
              x,
              y,
              top: y,
              left: x,
              right: x,
              bottom: y,
            };
          },
          contextElement: fallbackDom || undefined,
        };
        placement = "bottom-start";
      }

      if (positionReference) {
        setState({
          isOpen: true,
          domReference,
          positionReference,
          placement,
          groups,
        });
        setActiveIndex(-1);
      }
    },
    []
  );

  // Close on window/ancestor scroll
  useEffect(() => {
    if (!state.isOpen) return;
    const handleScroll = () => {
      closeContextMenu();
    };
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, [state.isOpen, closeContextMenu]);

  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open: state.isOpen,
    onOpenChange: (open) => !open && closeContextMenu(),
    placement: state.placement,
    strategy: "fixed",
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({
        fallbackPlacements: [
          state.placement === "bottom-end" ? "top-end" : "top-start",
          "bottom-start",
          "top-start",
          "bottom-end",
        ],
      }),
      shift({ padding: 8 }),
    ],
  });

  useEffect(() => {
    if (state.isOpen) {
      if (state.domReference) {
        refs.setReference(state.domReference);
      }
      if (state.positionReference) {
        refs.setPositionReference(state.positionReference);
      }
    }
  }, [state.isOpen, state.domReference, state.positionReference, refs]);

  const dismiss = useDismiss(context, {
    outsidePress: true,
    escapeKey: true,
    ancestorScroll: true,
  });
  const role = useRole(context, { role: "menu" });
  const { getFloatingProps } = useInteractions([dismiss, role]);

  const visibleItems = state.groups
    .flatMap((g) => g.items)
    .filter((item) => item.show !== false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!state.isOpen) return;
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
        closeContextMenu();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeContextMenu();
    }
  };

  const menuTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.14, ease: "easeOut" as const };

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
                  className="relative z-50 w-full rounded-t-xl border-t border-[var(--border)] bg-[var(--panel)] p-4 shadow-overlay max-h-[85vh] overflow-y-auto"
                >
                  <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border)]" />
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
                    <span className="text-xs font-semibold text-[var(--text-3)] ">
                      Actions
                    </span>
                    <button
                      onClick={closeContextMenu}
                      className="p-1 text-[var(--text-3)] hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {state.groups.map((group, gIdx) => {
                      const groupItems = group.items.filter((item) => item.show !== false);
                      if (groupItems.length === 0) return null;
                      return (
                        <div key={gIdx} className={gIdx > 0 ? "pt-2 mt-2 border-t border-[var(--border)]" : ""}>
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
                                  : "text-white active:bg-[var(--input)]"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {item.icon && (
                                  <span className={item.danger ? "text-red-400" : "text-[var(--text-2)]"}>
                                    {item.icon}
                                  </span>
                                )}
                                <span>{item.label}</span>
                              </div>
                              {item.shortcut && (
                                <span className="font-mono text-xs text-[var(--text-3)]">
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
              <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
                <motion.div
                  ref={refs.setFloating}
                  style={{
                    ...floatingStyles,
                    visibility: isPositioned ? "visible" : "hidden",
                  }}
                  initial={{ opacity: 0, scale: 0.98, y: -2 }}
                  animate={{ opacity: isPositioned ? 1 : 0, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -2 }}
                  transition={menuTransition}
                  data-testid="item-menu"
                  {...getFloatingProps({
                    onKeyDown: handleKeyDown,
                  })}
                  className="z-50 w-56 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] p-1.5 shadow-overlay outline-none max-h-[min(480px,80vh)] overflow-y-auto"
                >
                  {state.groups.map((group, gIdx) => {
                    const groupItems = group.items.filter((item) => item.show !== false);
                    if (groupItems.length === 0) return null;
                    return (
                      <div
                        key={gIdx}
                        className={
                          gIdx > 0
                            ? "my-1 pt-1 border-t border-[var(--border)]"
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
                                  closeContextMenu();
                                }
                              }}
                              onMouseEnter={() => setActiveIndex(globalIndex)}
                              className={`flex h-9 w-full items-center justify-between rounded-[8px] px-2.5 text-sm font-normal transition-colors outline-none ${
                                item.disabled
                                  ? "opacity-40 cursor-not-allowed text-[var(--text-3)]"
                                  : item.danger
                                  ? isFocused
                                    ? "bg-[#F0506E]/15 text-[#F0506E]"
                                    : "text-[#F0506E] hover:bg-[#F0506E]/10"
                                  : isFocused
                                  ? "bg-[var(--hover)] text-white"
                                  : "text-white hover:bg-[var(--hover)]"
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
                                        : "text-[var(--text-2)]"
                                    }`}
                                  >
                                    {item.icon}
                                  </span>
                                )}
                                <span className="truncate">{item.label}</span>
                              </div>
                              {item.shortcut && (
                                <span className="shrink-0 font-mono text-xs text-[var(--text-3)] pl-2">
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
    </ContextMenuContext.Provider>
  );
}

