"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { FileText, Folder, Clock } from "lucide-react";

export interface DocumentListItem {
  id: string;
  title: string;
  project_id: string;
  project_name: string;
  client_id?: string;
  client_name?: string;
  plain_text_snippet?: string;
  word_count: number;
  character_count: number;
  reading_time_seconds: number;
  updated_at: string;
  created_at: string;
}

interface DocumentCardProps {
  document: DocumentListItem;
  isNew?: boolean;
}

export function DocumentCard({ document, isNew = false }: DocumentCardProps) {
  const shouldReduceMotion = useReducedMotion();
  const formattedDate = new Date(document.updated_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <motion.div
      layout
      initial={isNew && !shouldReduceMotion ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-xl transition-all duration-1000 ${
        isNew
          ? "ring-2 ring-[#4876F3] shadow-[0_0_24px_rgba(72,118,243,0.35)]"
          : ""
      }`}
    >
      <Link
        href={`/d/${document.id}`}
        className="group relative flex flex-col justify-between h-64 rounded-xl border border-border/80 bg-card/80 hover:bg-card hover:border-[#4876F3]/50 transition-all p-5 shadow-sm hover:shadow-md overflow-hidden select-none"
      >
        {/* Dog-Ear Corner */}
        <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none">
          <div className="absolute top-0 right-0 w-0 h-0 border-t-[32px] border-l-[32px] border-t-background border-l-transparent transition-colors group-hover:border-t-background" />
          <div className="absolute top-0 right-0 w-0 h-0 border-b-[32px] border-r-[32px] border-b-border/60 border-r-transparent drop-shadow-sm transition-colors group-hover:border-b-[#4876F3]/40" />
        </div>

        <div>
          {/* Top Meta Bar */}
          <div className="flex items-center justify-between pr-8 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-bold  bg-blue-500/15 text-blue-400 border border-blue-500/30">
              <FileText className="w-3 h-3" />
              <span>DOC</span>
            </span>

            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{formattedDate}</span>
            </span>
          </div>

          {/* Title */}
          <h3 className="text-sm font-semibold text-foreground group-hover:text-[#4876F3] transition-colors line-clamp-1 mb-2">
            {document.title || "Untitled Document"}
          </h3>

          {/* Mini Paper Preview */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-xs text-muted-foreground line-clamp-4 leading-relaxed font-sans min-h-[72px]">
            {document.plain_text_snippet ? (
              document.plain_text_snippet
            ) : (
              <div className="space-y-1.5 opacity-40">
                <div className="h-2 bg-muted-foreground rounded w-5/6" />
                <div className="h-2 bg-muted-foreground rounded w-full" />
                <div className="h-2 bg-muted-foreground rounded w-3/4" />
              </div>
            )}
          </div>
        </div>

        {/* Card Footer */}
        <div className="pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{document.project_name || "Project"}</span>
          </div>
          <span className="shrink-0 font-mono text-[11px]">
            {document.word_count || 0}w
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
