"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  DocumentCard,
  DocumentListItem,
} from "@/components/documents/document-card";
import { NewDocumentDialog } from "@/components/documents/new-document-dialog";
import {
  FileText,
  Plus,
  Search,
  Filter,
  Loader2,
  Building2,
  FolderOpen,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";

import { useRouter } from "next/navigation";

interface ClientChip {
  id: string;
  name: string;
  count: number;
}

export default function DocumentsPage() {
  const router = useRouter();
  const { user, isClient, isLoading: authLoading } = useAuth();

  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newlyCreatedDocId, setNewlyCreatedDocId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    let isMounted = true;
    async function loadDocuments() {
      try {
        setLoading(true);
        const res = await apiRequest<{ documents: DocumentListItem[] }>("/documents");
        if (isMounted && res && res.documents) {
          setDocuments(res.documents);
        }
      } catch (err) {
        console.error("Failed to load documents", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDocuments();
    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  // Compute Client Chips with document counts
  const clientChips: ClientChip[] = useMemo(() => {
    const map = new Map<string, ClientChip>();
    documents.forEach((d) => {
      if (d.client_id && d.client_name) {
        const existing = map.get(d.client_id);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(d.client_id, {
            id: d.client_id,
            name: d.client_name,
            count: 1,
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [documents]);

  // Filter documents by search and client
  const filteredDocuments = useMemo(() => {
    return documents.filter((d) => {
      const matchesSearch =
        d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.project_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesClient =
        selectedClientId === "all" || d.client_id === selectedClientId;

      return matchesSearch && matchesClient;
    });
  }, [documents, searchQuery, selectedClientId]);

  return (
    <>
      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Header & Aggregate Count Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Documents
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {loading
                    ? "Loading documents..."
                    : `${documents.length} ${
                        documents.length === 1 ? "document" : "documents"
                      } across your workspace`}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNewDocOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Document</span>
          </button>
        </div>

        {/* Filter Toolbar & Client Chips */}
        <div className="space-y-4">
          {/* Client Filter Chips */}
          {clientChips.length > 0 && !isClient && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                type="button"
                onClick={() => setSelectedClientId("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 flex items-center gap-1.5 ${
                  selectedClientId === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>All clients</span>
                <span className="opacity-80 font-mono text-[11px]">
                  ({documents.length})
                </span>
              </button>

              {clientChips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClientId(c.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 flex items-center gap-1.5 ${
                    selectedClientId === c.id
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted/40 border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Building2 className="w-3 h-3 opacity-70" />
                  <span>{c.name}</span>
                  <span className="opacity-80 font-mono text-[11px]">
                    ({c.count})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-[#7C7F87] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title or project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#2A2B30] border border-[#2E2F34] rounded-[10px] pl-9 pr-4 py-2 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] transition-colors shadow-sm"
            />
          </div>
        </div>

        {/* Documents Grid / Skeletons / Empty State */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-64 rounded-2xl border border-border bg-card/40 p-5 animate-pulse space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="w-12 h-5 bg-muted rounded" />
                  <div className="w-14 h-4 bg-muted rounded" />
                </div>
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-20 bg-muted/60 rounded-xl" />
                <div className="pt-3 border-t border-border flex justify-between">
                  <div className="w-20 h-3 bg-muted rounded" />
                  <div className="w-8 h-3 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-dashed border-border/80 bg-card/30 p-8">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 opacity-60" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              {searchQuery || selectedClientId !== "all"
                ? "No matching documents found"
                : "No documents created yet"}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-5">
              {searchQuery || selectedClientId !== "all"
                ? "Try refining your search keyword or clearing client filters."
                : "Create scripts, production briefs, and notes with real-time team collaboration."}
            </p>
            {(!searchQuery && selectedClientId === "all") && (
              <button
                type="button"
                onClick={() => setNewDocOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create first document</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                isNew={doc.id === newlyCreatedDocId}
              />
            ))}
          </div>
        )}
      </div>

      {/* New Document Dialog */}
      <NewDocumentDialog
        isOpen={newDocOpen}
        onClose={() => setNewDocOpen(false)}
        onDocumentCreated={(newDoc) => {
          setDocuments((prev) => [newDoc, ...prev]);
          setNewlyCreatedDocId(newDoc.id);
          // Highlight card for 1 second, then navigate to editor with title selected
          setTimeout(() => {
            router.push(`/d/${newDoc.id}?new=1`);
          }, 1000);
        }}
      />
    </>
  );
}
