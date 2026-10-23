"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { apiRequest } from "@/lib/api";
import {
  Search,
  Plus,
  ExternalLink,
  Copy,
  Trash2,
  X,
  Loader2,
  Check,
  Link2,
} from "@/components/ui/icon";
import { toast } from "@/lib/toast";

interface QuickLinkItem {
  id: string;
  name?: string;
  title?: string;
  url: string;
  created_at?: string;
}

const BADGE_PALETTES = [
  { bg: "#1e293b", text: "#60a5fa" }, // Slate blue
  { bg: "#2e1065", text: "#c084fc" }, // Purple
  { bg: "#450a0a", text: "#f87171" }, // Crimson
  { bg: "#064e3b", text: "#34d399" }, // Emerald
  { bg: "#451a03", text: "#fbbf24" }, // Amber
  { bg: "#0f766e", text: "#4dd6ac" }, // Teal
  { bg: "#2a2b30", text: "#9ca3af" }, // Gray
  { bg: "#17171a", text: "#a1a1aa" }, // Neutral
];

function getBadgeColors(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BADGE_PALETTES[Math.abs(hash) % BADGE_PALETTES.length];
}

function formatUrlPreview(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const domain = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname + parsed.search;
    const combined = domain + path;
    if (combined.length > 42) {
      return combined.slice(0, 39) + "...";
    }
    return combined;
  } catch {
    return rawUrl.replace(/^https?:\/\//, "");
  }
}

export default function QuickLinksPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch quick links
  const { data, isLoading } = useQuery<{ quick_links: QuickLinkItem[] }>({
    queryKey: ["quick-links"],
    queryFn: () => apiRequest<{ quick_links: QuickLinkItem[] }>("/quick-links"),
    enabled: !!user,
  });

  const links = data?.quick_links || [];

  // Filter links by search
  const filteredLinks = useMemo(() => {
    if (!searchQuery.trim()) return links;
    const q = searchQuery.toLowerCase().trim();
    return links.filter((l) => {
      const name = (l.name || l.title || "").toLowerCase();
      const url = l.url.toLowerCase();
      return name.includes(q) || url.includes(q);
    });
  }, [links, searchQuery]);

  // Handle Add Submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    let url = newUrl.trim();

    if (!title) {
      toast.error("Please enter a name");
      return;
    }

    if (!url) {
      toast.error("Please enter a link");
      return;
    }

    // Ensure http or https (Requirement 8)
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        toast.error("Links must start with http:// or https://");
        return;
      }
    } catch {
      toast.error("Invalid link address");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("/quick-links", {
        method: "POST",
        body: JSON.stringify({
          name: title,
          link: url,
        }),
      });
      toast.success("Quick link added");
      setNewTitle("");
      setNewUrl("");
      setShowAddModal(false);
      queryClient.invalidateQueries({ queryKey: ["quick-links"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add quick link");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Copy to Clipboard
  const handleCopy = (id: string, url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // Handle Delete
  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Remove quick link "${name}"?`)) return;

    try {
      await apiRequest(`/quick-links/${id}`, { method: "DELETE" });
      toast.success("Quick link removed");
      queryClient.invalidateQueries({ queryKey: ["quick-links"] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete quick link");
    }
  };

  // Open Link
  const handleOpen = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex-1 w-full min-h-screen bg-[var(--bg)] text-white p-6 md:p-8 space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Quick links</h1>
          <p className="text-xs text-[var(--text-3)] mt-1">
            Your private shortcuts. Only you can see them.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-[10px] bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Add quick link</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative w-full sm:w-80 pt-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search quick links"
          className="w-full h-9 pl-9 pr-3 rounded-[8px] bg-[var(--input)] border border-transparent hover:border-[var(--border)] focus:border-[var(--accent)] text-xs text-white placeholder-[var(--text-3)] focus:outline-none transition-colors"
        />
      </div>

      {/* Grid of Cards */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-[var(--text-3)] gap-2">
          <Loader2 size={24} className="animate-spin text-[#4876F3]" />
          <span className="text-xs">Loading quick links...</span>
        </div>
      ) : filteredLinks.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-12 text-center">
          <Link2 size={32} className="mx-auto text-[var(--text-3)] mb-3" />
          <h3 className="text-sm font-semibold text-white">No quick links yet</h3>
          <p className="text-xs text-[var(--text-3)] mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No quick links matching "${searchQuery}"`
              : "Add your personal links to drives, brand kits, music libraries, and review portals."}
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors"
          >
            Add quick link
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredLinks.map((item) => {
            const displayName = item.name || item.title || "Quick Link";
            const initial = displayName.charAt(0).toUpperCase();
            const colors = getBadgeColors(displayName);
            const isCopied = copiedId === item.id;

            return (
              <div
                key={item.id}
                onClick={() => handleOpen(item.url)}
                className="group relative flex items-center justify-between p-3.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] hover:border-[var(--border-strong)] transition-colors cursor-pointer"
              >
                {/* Left side: Square Letter Badge + Name & URL */}
                <div className="flex items-center gap-3.5 min-w-0 pr-2">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 border border-[var(--border)]"
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {initial}
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-xs font-semibold text-white truncate group-hover:text-[#4876F3] transition-colors">
                      {displayName}
                    </h3>
                    <p className="text-xs text-[var(--text-3)] truncate mt-0.5 font-mono">
                      {formatUrlPreview(item.url)}
                    </p>
                  </div>
                </div>

                {/* Right side: Action icons (Copy, External Link, Delete on hover) */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Copy button */}
                  <button
                    type="button"
                    onClick={(e) => handleCopy(item.id, item.url, e)}
                    title="Copy link"
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-all"
                  >
                    {isCopied ? (
                      <Check size={16} className="text-[#3FCF8E]" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>

                  {/* Open in new tab button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpen(item.url);
                    }}
                    title="Open in new tab"
                    className="p-1.5 rounded-md text-[var(--text-3)] group-hover:text-white hover:bg-[var(--hover)] transition-colors"
                  >
                    <ExternalLink size={16} />
                  </button>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(item.id, displayName, e)}
                    title="Delete link"
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-[var(--text-3)] hover:text-[#F0506E] hover:bg-[var(--hover)] transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Quick Link Modal (Matches Q1 Mockup) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div
            className="fixed inset-0"
            onClick={() => setShowAddModal(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--panel-raised)] shadow-[0_16px_36px_rgba(0,0,0,0.6)] overflow-hidden z-10">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-white">Add quick link</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddSubmit}>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Client Drive"
                    className="w-full h-9 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                    autoFocus
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                    Link
                  </label>
                  <input
                    type="text"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full h-9 px-3 rounded-lg bg-[var(--input)] border border-[var(--border)] text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] font-mono transition-colors"
                    required
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border)] bg-[var(--panel)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  <span>Save</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
