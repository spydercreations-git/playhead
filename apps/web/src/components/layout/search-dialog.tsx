"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Folder,
  FileText,
  Building2,
  VideoFileIcon,
  CheckCircle2,
  ChevronRight,
  Loader2,
} from "@/components/ui/icon";
import { apiRequest } from "@/lib/api";

interface SearchResult {
  id: string;
  type: "client" | "project" | "folder" | "file" | "task" | "document";
  title: string;
  subtitle: string;
  url: string;
  status?: string;
  category?: string;
  project_id?: string;
  client_id?: string;
}

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchDialog({ isOpen, onClose }: SearchDialogProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle global shortcut Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Open handled externally or could trigger
        }
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Debounced search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest<{ results: SearchResult[] }>(
          `/search?q=${encodeURIComponent(trimmed)}`
        );
        setResults(data?.results || []);
        setSelectedIndex(0);
      } catch (err) {
        console.error("Search failed:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation through results
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        results.length > 0 ? (prev - 1 + results.length) % results.length : 0
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  const handleSelect = (item: SearchResult) => {
    onClose();
    router.push(item.url);
  };

  if (!isOpen) return null;

  // Group results by type
  const clients = results.filter((r) => r.type === "client");
  const projects = results.filter((r) => r.type === "project");
  const items = results.filter((r) => r.type === "file" || r.type === "folder");
  const tasks = results.filter((r) => r.type === "task");
  const documents = results.filter((r) => r.type === "document");

  const getItemIcon = (type: string) => {
    switch (type) {
      case "client":
        return <Building2 size={16} className="text-[#3FCF8E] shrink-0" />;
      case "project":
        return <Folder size={16} className="text-[#4876F3] shrink-0" />;
      case "folder":
        return <Folder size={16} className="text-[var(--text-3)] shrink-0" />;
      case "file":
        return <VideoFileIcon size={16} className="text-[#9787FF] shrink-0" />;
      case "task":
        return <CheckCircle2 size={16} className="text-[#FFBB56] shrink-0" />;
      case "document":
        return <FileText size={16} className="text-[#4876F3] shrink-0" />;
      default:
        return <Search size={16} className="text-[var(--text-3)] shrink-0" />;
    }
  };

  let globalIndexCounter = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--panel-raised)] shadow-[0_16px_36px_rgba(0,0,0,0.6)] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[var(--border)] gap-3">
          <Search size={18} className="text-[var(--text-3)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search files, projects, clients, tasks, and documents..."
            className="flex-1 bg-transparent text-sm text-white placeholder-[var(--text-3)] focus:outline-none"
          />
          {loading && <Loader2 size={16} className="animate-spin text-[var(--text-3)]" />}
          {query && !loading && (
            <button
              onClick={() => setQuery("")}
              className="p-1 rounded-md text-[var(--text-3)] hover:text-white"
            >
              <X size={14} />
            </button>
          )}
          <kbd className="px-2 py-0.5 rounded bg-[var(--input)] text-xs text-[var(--text-3)] border border-[var(--border)] select-none">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-[var(--border)]/30">
          {query.trim() === "" ? (
            <div className="p-8 text-center text-[var(--text-3)] text-xs">
              Type to search across clients, projects, folders, files, tasks, and documents.
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="p-8 text-center text-[var(--text-3)] text-xs">
              No results found for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <>
              {clients.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-xs font-semibold text-[var(--text-3)] tracking-wider">
                    Clients
                  </div>
                  {clients.map((item) => {
                    globalIndexCounter++;
                    const isSelected = selectedIndex === globalIndexCounter;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                          isSelected ? "bg-[var(--hover)] text-white" : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getItemIcon(item.type)}
                          <span className="font-medium text-white truncate">{item.title}</span>
                          <span className="text-xs text-[var(--text-3)] truncate">{item.subtitle}</span>
                        </div>
                        <ChevronRight size={14} className="text-[var(--text-3)] shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}

              {projects.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-xs font-semibold text-[var(--text-3)] tracking-wider">
                    Projects
                  </div>
                  {projects.map((item) => {
                    globalIndexCounter++;
                    const isSelected = selectedIndex === globalIndexCounter;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                          isSelected ? "bg-[var(--hover)] text-white" : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getItemIcon(item.type)}
                          <span className="font-medium text-white truncate">{item.title}</span>
                          <span className="text-xs text-[var(--text-3)] truncate">{item.subtitle}</span>
                        </div>
                        <ChevronRight size={14} className="text-[var(--text-3)] shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}

              {items.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-xs font-semibold text-[var(--text-3)] tracking-wider">
                    Files & Folders
                  </div>
                  {items.map((item) => {
                    globalIndexCounter++;
                    const isSelected = selectedIndex === globalIndexCounter;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                          isSelected ? "bg-[var(--hover)] text-white" : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getItemIcon(item.type)}
                          <span className="font-medium text-white truncate">{item.title}</span>
                          <span className="text-xs text-[var(--text-3)] truncate">{item.subtitle}</span>
                        </div>
                        {item.status && item.status !== "none" && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--input)] text-[var(--text-2)] capitalize shrink-0">
                            {item.status.replace("_", " ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {tasks.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-xs font-semibold text-[var(--text-3)] tracking-wider">
                    Tasks
                  </div>
                  {tasks.map((item) => {
                    globalIndexCounter++;
                    const isSelected = selectedIndex === globalIndexCounter;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                          isSelected ? "bg-[var(--hover)] text-white" : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getItemIcon(item.type)}
                          <span className="font-medium text-white truncate">{item.title}</span>
                          <span className="text-xs text-[var(--text-3)] truncate">{item.subtitle}</span>
                        </div>
                        {item.status && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--input)] text-[var(--text-2)] capitalize shrink-0">
                            {item.status.replace("_", " ")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {documents.length > 0 && (
                <div className="py-1">
                  <div className="px-3 py-1 text-xs font-semibold text-[var(--text-3)] tracking-wider">
                    Documents
                  </div>
                  {documents.map((item) => {
                    globalIndexCounter++;
                    const isSelected = selectedIndex === globalIndexCounter;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelect(item)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                          isSelected ? "bg-[var(--hover)] text-white" : "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-white"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getItemIcon(item.type)}
                          <span className="font-medium text-white truncate">{item.title}</span>
                          <span className="text-xs text-[var(--text-3)] truncate">{item.subtitle}</span>
                        </div>
                        <ChevronRight size={14} className="text-[var(--text-3)] shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-[var(--border)] bg-[var(--panel)] text-xs text-[var(--text-3)]">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span>Playhead Search</span>
        </div>
      </div>
    </div>
  );
}
