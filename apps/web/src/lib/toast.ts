import { create } from "zustand";

export interface ToastItem {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  reason?: string;
  undo?: () => void | Promise<void>;
  undoLabel?: string;
  retry?: () => void | Promise<void>;
  duration?: number;
  createdAt: number;
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, "id" | "createdAt">) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (newToast) => {
    const id = "toast_" + Math.random().toString(36).slice(2, 9);
    set((state) => {
      const updated = [
        ...state.toasts,
        {
          ...newToast,
          id,
          createdAt: Date.now(),
          duration: newToast.duration ?? 5000,
        },
      ];
      // Keep only up to 3 at once
      if (updated.length > 3) {
        return { toasts: updated.slice(updated.length - 3) };
      }
      return { toasts: updated };
    });
    return id;
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clearAll: () => set({ toasts: [] }),
}));

export const toast = {
  success: (
    message: string,
    options?: { undo?: () => void | Promise<void>; undoLabel?: string; duration?: number }
  ) => {
    return useToastStore.getState().addToast({
      type: "success",
      message,
      undo: options?.undo,
      undoLabel: options?.undoLabel || "Undo",
      duration: options?.duration,
    });
  },
  error: (
    message: string,
    options?: { reason?: string; retry?: () => void | Promise<void>; duration?: number }
  ) => {
    return useToastStore.getState().addToast({
      type: "error",
      message,
      reason: options?.reason,
      retry: options?.retry,
      duration: options?.duration ?? 6000,
    });
  },
  info: (message: string, options?: { duration?: number }) => {
    return useToastStore.getState().addToast({
      type: "info",
      message,
      duration: options?.duration,
    });
  },
  dismiss: (id: string) => {
    useToastStore.getState().dismissToast(id);
  },
};
