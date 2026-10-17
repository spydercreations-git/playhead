import { create } from "zustand";
import { apiRequest } from "./api";

export interface CompletedPart {
  part_number: number;
  etag: string;
}

export interface UploadItem {
  id: string;
  uploadId: string;
  itemId?: string;
  projectId?: string;
  parentId?: string | null;
  targetPath: string;
  file?: File;
  filename: string;
  sizeBytes: number;
  mime: string;
  partSizeBytes: number;
  totalParts: number;
  completedParts: CompletedPart[];
  progressPercent: number;
  uploadedBytes: number;
  speedBytesPerSec: number;
  status: "pending" | "uploading" | "paused" | "completed" | "error";
  errorMsg?: string;
  errorType?: "quota" | "size" | "permission" | "network" | "other";
  previewUrl?: string;
}

interface UploadState {
  uploads: UploadItem[];
  isOpen: boolean;
  isMinimized: boolean;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  toggleMinimized: () => void;
  setMinimized: (min: boolean) => void;
  addUploads: (files: File[], opts: { projectId?: string; parentId?: string | null; targetPath?: string }) => Promise<void>;
  pauseUpload: (id: string) => void;
  resumeUpload: (id: string, reattachedFile?: File) => Promise<void>;
  cancelUpload: (id: string) => Promise<void>;
  clearCompleted: () => void;
  attachFile: (id: string, file: File) => void;
}

// Active abort controllers and workers per upload
const activeAbortControllers = new Map<string, AbortController>();

function parseUploadError(err: any): { message: string; type: UploadItem["errorType"] } {
  const msg = err?.message || err?.error || "";
  const lower = String(msg).toLowerCase();

  if (lower.includes("quota") || lower.includes("storage limit")) {
    return {
      message: "Storage quota exceeded. Upgrade your plan in Settings to upload more.",
      type: "quota",
    };
  }
  if (lower.includes("too large") || lower.includes("max file size") || lower.includes("file_too_large")) {
    return {
      message: "File exceeds the 100 GB maximum size limit.",
      type: "size",
    };
  }
  if (lower.includes("forbidden") || lower.includes("permission")) {
    return {
      message: "You don't have permission to upload files to this project.",
      type: "permission",
    };
  }
  if (lower.includes("network") || lower.includes("failed to fetch") || lower.includes("offline")) {
    return {
      message: "Network disconnected. Check connection and retry.",
      type: "network",
    };
  }
  return {
    message: msg || "Upload failed. Please try again.",
    type: "other",
  };
}

export const useUploadStore = create<UploadState>((set, get) => ({
  uploads: [],
  isOpen: false,
  isMinimized: false,

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  toggleMinimized: () => set((state) => ({ isMinimized: !state.isMinimized })),
  setMinimized: (min) => set({ isMinimized: min }),

  attachFile: (id, file) => {
    set((state) => ({
      uploads: state.uploads.map((u) => (u.id === id ? { ...u, file, errorMsg: undefined } : u)),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      uploads: state.uploads.filter((u) => u.status !== "completed"),
    }));
  },

  pauseUpload: (id: string) => {
    const controller = activeAbortControllers.get(id);
    if (controller) {
      controller.abort();
      activeAbortControllers.delete(id);
    }
    set((state) => ({
      uploads: state.uploads.map((u) =>
        u.id === id ? { ...u, status: "paused", speedBytesPerSec: 0 } : u
      ),
    }));
  },

  cancelUpload: async (id: string) => {
    const controller = activeAbortControllers.get(id);
    if (controller) {
      controller.abort();
      activeAbortControllers.delete(id);
    }

    const item = get().uploads.find((u) => u.id === id);
    if (item && item.uploadId) {
      try {
        await apiRequest(`/uploads/${item.uploadId}/abort`, { method: "POST" });
      } catch {
        // ignore abort cleanup errors
      }
    }

    set((state) => ({
      uploads: state.uploads.filter((u) => u.id !== id),
    }));
  },

  resumeUpload: async (id: string, reattachedFile?: File) => {
    const item = get().uploads.find((u) => u.id === id);
    if (!item) return;

    const file = reattachedFile || item.file;
    if (!file) {
      set((state) => ({
        uploads: state.uploads.map((u) =>
          u.id === id
            ? { ...u, status: "paused", errorMsg: "Waiting for file selection to resume" }
            : u
        ),
      }));
      return;
    }

    // Check server for already completed parts
    let completedParts = [...item.completedParts];
    try {
      const partsRes = await apiRequest(`/uploads/${item.uploadId}/parts`, { method: "GET" });
      if (partsRes && Array.isArray(partsRes.completed_parts)) {
        completedParts = partsRes.completed_parts.map((p: any) => ({
          part_number: p.part_number,
          etag: p.etag,
        }));
      }
    } catch {
      // Continue with client parts if server query fails
    }

    const partSize = item.partSizeBytes || 5 * 1024 * 1024;
    const uploadedBytes = completedParts.length * partSize;
    const progressPercent = Math.min(99, Math.round((uploadedBytes / file.size) * 100));

    set((state) => ({
      uploads: state.uploads.map((u) =>
        u.id === id
          ? {
              ...u,
              file,
              status: "uploading",
              errorMsg: undefined,
              errorType: undefined,
              completedParts,
              uploadedBytes,
              progressPercent,
            }
          : u
      ),
    }));

    // Start execution
    await executeUploadPipeline(id, file, item.uploadId, partSize, completedParts);
  },

  addUploads: async (files: File[], opts) => {
    if (files.length === 0) return;

    // Open panel automatically
    set({ isOpen: true, isMinimized: false });

    for (const file of files) {
      const tempId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      let previewUrl: string | undefined;
      if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {
          // ignore
        }
      }

      const isDrive = !opts.projectId || opts.projectId === "drive";
      const targetPath = opts.targetPath || (isDrive ? "My Drive" : "Project files");

      // Optimistic pending item
      const newItem: UploadItem = {
        id: tempId,
        uploadId: "",
        projectId: opts.projectId,
        parentId: opts.parentId,
        targetPath,
        file,
        filename: file.name,
        sizeBytes: file.size,
        mime: file.type || "application/octet-stream",
        partSizeBytes: 5 * 1024 * 1024,
        totalParts: Math.max(1, Math.ceil(file.size / (5 * 1024 * 1024))),
        completedParts: [],
        progressPercent: 0,
        uploadedBytes: 0,
        speedBytesPerSec: 0,
        status: "uploading",
        previewUrl,
      };

      set((state) => ({
        uploads: [newItem, ...state.uploads],
      }));

      // Initiate on server
      try {
        const initRes = await apiRequest("/uploads/initiate", {
          method: "POST",
          body: JSON.stringify({
            project_id: isDrive ? "" : opts.projectId,
            parent_id: opts.parentId || null,
            filename: file.name,
            size_bytes: file.size,
            mime: file.type || "application/octet-stream",
          }),
        });

        const partSizeBytes = initRes.part_size_bytes || 5 * 1024 * 1024;
        const totalParts = Math.max(1, Math.ceil(file.size / partSizeBytes));

        set((state) => ({
          uploads: state.uploads.map((u) =>
            u.id === tempId
              ? {
                  ...u,
                  uploadId: initRes.upload_id,
                  itemId: initRes.item_id,
                  partSizeBytes,
                  totalParts,
                }
              : u
          ),
        }));

        if (initRes.strategy === "single") {
          await executeSingleUpload(tempId, initRes.upload_url, file, initRes.upload_id, initRes.item_id);
        } else {
          await executeUploadPipeline(tempId, file, initRes.upload_id, partSizeBytes, []);
        }
      } catch (err: any) {
        const parsed = parseUploadError(err);
        set((state) => ({
          uploads: state.uploads.map((u) =>
            u.id === tempId
              ? {
                  ...u,
                  status: "error",
                  errorMsg: parsed.message,
                  errorType: parsed.type,
                  speedBytesPerSec: 0,
                }
              : u
          ),
        }));
      }
    }
  },
}));

// Single file direct PUT
async function executeSingleUpload(
  id: string,
  putUrl: string,
  file: File,
  uploadId: string,
  itemId?: string
) {
  const abortController = new AbortController();
  activeAbortControllers.set(id, abortController);

  const xhr = new XMLHttpRequest();
  let lastLoaded = 0;
  let lastTime = Date.now();

  xhr.upload.onprogress = (evt) => {
    if (evt.lengthComputable) {
      const now = Date.now();
      const diffSec = (now - lastTime) / 1000;
      if (diffSec > 0.3) {
        const diffBytes = evt.loaded - lastLoaded;
        const speed = diffBytes / diffSec;
        lastLoaded = evt.loaded;
        lastTime = now;

        useUploadStore.setState((state) => ({
          uploads: state.uploads.map((u) =>
            u.id === id
              ? {
                  ...u,
                  uploadedBytes: evt.loaded,
                  progressPercent: Math.round((evt.loaded / evt.total) * 100),
                  speedBytesPerSec: speed,
                }
              : u
          ),
        }));
      }
    }
  };

  xhr.onload = async () => {
    activeAbortControllers.delete(id);
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        await apiRequest("/uploads/complete", {
          method: "POST",
          body: JSON.stringify({ upload_id: uploadId, item_id: itemId }),
        });
        useUploadStore.setState((state) => ({
          uploads: state.uploads.map((u) =>
            u.id === id
              ? {
                  ...u,
                  status: "completed",
                  progressPercent: 100,
                  uploadedBytes: file.size,
                  speedBytesPerSec: 0,
                }
              : u
          ),
        }));
      } catch (err: any) {
        const parsed = parseUploadError(err);
        useUploadStore.setState((state) => ({
          uploads: state.uploads.map((u) =>
            u.id === id ? { ...u, status: "error", errorMsg: parsed.message, errorType: parsed.type } : u
          ),
        }));
      }
    } else {
      useUploadStore.setState((state) => ({
        uploads: state.uploads.map((u) =>
          u.id === id
            ? { ...u, status: "error", errorMsg: `Upload failed (HTTP ${xhr.status})`, errorType: "other" }
            : u
        ),
      }));
    }
  };

  xhr.onerror = () => {
    activeAbortControllers.delete(id);
    useUploadStore.setState((state) => ({
      uploads: state.uploads.map((u) =>
        u.id === id
          ? { ...u, status: "error", errorMsg: "Network disconnected. Check connection and retry.", errorType: "network" }
          : u
      ),
    }));
  };

  abortController.signal.addEventListener("abort", () => {
    xhr.abort();
  });

  xhr.open("PUT", putUrl);
  xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
  xhr.send(file);
}

// Multipart parallel pipeline with chunk resume and retry
async function executeUploadPipeline(
  id: string,
  file: File,
  uploadId: string,
  partSizeBytes: number,
  initialCompletedParts: CompletedPart[]
) {
  const abortController = new AbortController();
  activeAbortControllers.set(id, abortController);

  const totalParts = Math.max(1, Math.ceil(file.size / partSizeBytes));
  const completedParts: CompletedPart[] = [...initialCompletedParts];
  const completedPartNumbers = new Set(completedParts.map((p) => p.part_number));

  const concurrency = 3;
  let nextPart = 1;
  let activeWorkers = 0;
  let loadedBytes = completedParts.reduce((acc, p) => {
    const isLast = p.part_number === totalParts;
    const size = isLast ? file.size - (totalParts - 1) * partSizeBytes : partSizeBytes;
    return acc + size;
  }, 0);

  let lastReportedTime = Date.now();
  let lastReportedBytes = loadedBytes;

  return new Promise<void>((resolve) => {
    let hasFailed = false;

    const runWorker = async () => {
      while (nextPart <= totalParts && !hasFailed) {
        if (abortController.signal.aborted) return;

        const currentPart = nextPart++;
        if (completedPartNumbers.has(currentPart)) {
          continue;
        }

        let retries = 3;
        let success = false;

        while (retries > 0 && !success && !abortController.signal.aborted) {
          try {
            // Get presigned URL for this part
            const presignRes = await apiRequest("/uploads/presign-part", {
              method: "POST",
              body: JSON.stringify({
                upload_id: uploadId,
                part_number: currentPart,
              }),
            });

            const startByte = (currentPart - 1) * partSizeBytes;
            const endByte = Math.min(startByte + partSizeBytes, file.size);
            const chunk = file.slice(startByte, endByte);

            const putRes = await fetch(presignRes.upload_url, {
              method: "PUT",
              body: chunk,
              signal: abortController.signal,
            });

            if (!putRes.ok) {
              throw new Error(`Part upload failed with HTTP ${putRes.status}`);
            }

            const rawEtag = putRes.headers.get("ETag") || `part-${currentPart}`;
            const etag = rawEtag.replace(/"/g, "");

            completedParts.push({ part_number: currentPart, etag });
            completedPartNumbers.add(currentPart);

            loadedBytes += chunk.size;
            success = true;

            const now = Date.now();
            const timeDiff = (now - lastReportedTime) / 1000;
            let speed = 0;
            if (timeDiff > 0.5) {
              speed = (loadedBytes - lastReportedBytes) / timeDiff;
              lastReportedTime = now;
              lastReportedBytes = loadedBytes;
            }

            useUploadStore.setState((state) => ({
              uploads: state.uploads.map((u) =>
                u.id === id
                  ? {
                      ...u,
                      uploadedBytes: loadedBytes,
                      progressPercent: Math.min(99, Math.round((loadedBytes / file.size) * 100)),
                      completedParts: [...completedParts],
                      speedBytesPerSec: speed > 0 ? speed : u.speedBytesPerSec,
                    }
                  : u
              ),
            }));
          } catch (partErr: any) {
            if (abortController.signal.aborted) return;
            retries--;
            if (retries > 0) {
              // Wait 1s and retry
              await new Promise((r) => setTimeout(r, 1000));
            } else {
              hasFailed = true;
              const parsed = parseUploadError(partErr);
              activeAbortControllers.delete(id);
              useUploadStore.setState((state) => ({
                uploads: state.uploads.map((u) =>
                  u.id === id
                    ? {
                        ...u,
                        status: "error",
                        errorMsg: parsed.message,
                        errorType: parsed.type,
                        speedBytesPerSec: 0,
                      }
                    : u
                ),
              }));
              resolve();
              return;
            }
          }
        }
      }

      activeWorkers--;
      if (activeWorkers === 0 && !hasFailed && !abortController.signal.aborted) {
        // Complete multipart upload
        try {
          completedParts.sort((a, b) => a.part_number - b.part_number);
          const item = useUploadStore.getState().uploads.find((u) => u.id === id);

          await apiRequest("/uploads/complete", {
            method: "POST",
            body: JSON.stringify({
              upload_id: uploadId,
              item_id: item?.itemId,
              parts: completedParts,
            }),
          });

          activeAbortControllers.delete(id);
          useUploadStore.setState((state) => ({
            uploads: state.uploads.map((u) =>
              u.id === id
                ? {
                    ...u,
                    status: "completed",
                    progressPercent: 100,
                    uploadedBytes: file.size,
                    speedBytesPerSec: 0,
                  }
                : u
            ),
          }));
        } catch (completeErr: any) {
          activeAbortControllers.delete(id);
          const parsed = parseUploadError(completeErr);
          useUploadStore.setState((state) => ({
            uploads: state.uploads.map((u) =>
              u.id === id
                ? {
                    ...u,
                    status: "error",
                    errorMsg: parsed.message,
                    errorType: parsed.type,
                    speedBytesPerSec: 0,
                  }
                : u
            ),
          }));
        }
        resolve();
      }
    };

    const workerCount = Math.min(concurrency, totalParts);
    activeWorkers = workerCount;
    for (let i = 0; i < workerCount; i++) {
      runWorker();
    }
  });
}
