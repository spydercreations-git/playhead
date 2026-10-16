// API client helper for Playhead with credentials and CSRF protection
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";

function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)playhead_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  error?: string;

  constructor(status: number, message: string, code?: string, rawError?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.error = rawError || message;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

function formatServerErrorMessage(status: number, data: any): string {
  let raw = "";
  if (typeof data === "string") {
    raw = data.trim();
  } else if (typeof data === "object" && data !== null) {
    if (typeof data.message === "string" && data.message.trim() !== "") {
      raw = data.message.trim();
    } else if (typeof data.error === "string" && data.error.trim() !== "") {
      raw = data.error.trim();
    } else if (typeof data.detail === "string" && data.detail.trim() !== "") {
      raw = data.detail.trim();
    }
  }

  // Remove HTTP error prefixes like "Forbidden: ", "Unauthorized: ", "Error: "
  raw = raw.replace(/^(forbidden|unauthorized|error|bad request):\s*/i, "").trim();

  // Plain words normalization per spec requirements
  const lower = raw.toLowerCase();
  if (
    lower.includes("only team members can create") ||
    lower === "no_company_context" ||
    lower.includes("not a member of this company") ||
    lower.includes("not part of a team")
  ) {
    return "You're not on the team yet";
  }
  if (
    lower.includes("cannot create") ||
    lower.includes("cannot upload") ||
    lower.includes("no permission") ||
    lower.includes("insufficient permissions") ||
    lower.includes("only admins and managers")
  ) {
    return "No permission for this project";
  }
  if (
    lower.includes("relation") ||
    lower.includes("column") ||
    lower.includes("database error") ||
    lower.includes("table") ||
    lower.includes("migration") ||
    lower.includes("pgx:") ||
    lower.includes("pq:")
  ) {
    return "Database not up to date, run migrations";
  }

  if (raw !== "" && raw !== "forbidden" && raw !== "unauthorized" && raw !== "server_error") {
    return raw;
  }

  // Status code fallbacks
  switch (status) {
    case 401:
      return "Please sign in to continue";
    case 403:
      return "No permission for this project";
    case 404:
      return "The requested item was not found";
    case 409:
      return "An item with this name already exists";
    case 413:
      return "File exceeds upload size limit";
    case 429:
      return "Too many requests. Please slow down";
    case 500:
    case 502:
    case 503:
      return "Database not up to date, run migrations";
    default:
      return `Action failed (HTTP ${status})`;
  }
}

import { toast } from "./toast";

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  // Include CSRF token for mutating methods
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers.set("X-CSRF-Token", csrfToken);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // Ensure cookies are sent and received
  });

  const contentType = response.headers.get("content-type");
  let data: any = null;
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const pathname = window.location.pathname;
      const isPublic =
        pathname.startsWith("/login") ||
        pathname.startsWith("/signup") ||
        pathname.startsWith("/verify-email") ||
        pathname.startsWith("/forgot-password") ||
        pathname.startsWith("/reset-password") ||
        pathname.startsWith("/invite") ||
        pathname.startsWith("/s/") ||
        pathname.startsWith("/test-sheet-benchmark");

      if (!isPublic) {
        // Expired session on active protected page
        if (path !== "/me") {
          toast.error("You've been signed out");
          const target = `/login?redirect=${encodeURIComponent(pathname + window.location.search)}`;
          window.location.href = target;
        }
      }
    }

    const rawError = typeof data === "object" ? data?.error || data?.message : data;
    const message = formatServerErrorMessage(response.status, data);
    const code = typeof data === "object" ? data?.code : undefined;
    throw new ApiError(response.status, message, code, rawError);
  }

  return data as T;
}
