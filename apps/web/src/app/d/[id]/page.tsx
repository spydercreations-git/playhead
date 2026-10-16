"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";
import { apiRequest } from "@/lib/api";
import { DocumentEditor } from "@/components/documents/document-editor";
import { Loader2, FileQuestion, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface DocumentDetail {
  id: string;
  title: string;
  project_id?: string;
  project_name?: string;
  content_json: any;
  word_count: number;
  character_count: number;
  reading_time_seconds: number;
  is_team_member: boolean;
  can_edit: boolean;
}

export default function DocumentPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isClient, isLoading: authLoading } = useAuth();
  const documentId = params?.id as string;

  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    if (!documentId) return;

    let isMounted = true;
    async function loadDocument() {
      try {
        setLoading(true);
        setError(null);

        // Fetch document metadata and content
        // If client, API automatically routes to sanitized view
        const data = await apiRequest<DocumentDetail>(
          `/documents/${documentId}`
        );

        if (isMounted) {
          setDocument(data);
        }
      } catch (err: any) {
        console.error("Failed to load document", err);
        if (isMounted) {
          setError(
            err.message ||
              "Document not found or you do not have permission to view it."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDocument();
    return () => {
      isMounted = false;
    };
  }, [documentId, user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
        <span className="text-xs text-muted-foreground font-medium">
          Loading document...
        </span>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
        <div className="max-w-md w-full p-8 rounded-xl border border-border bg-card text-center shadow-lg">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
            <FileQuestion className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-foreground mb-2">
            Unable to open document
          </h2>
          <p className="text-xs text-muted-foreground mb-6">
            {error || "Document not found or access has been revoked."}
          </p>
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Documents</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <DocumentEditor
      documentId={document.id || (document as any).document_id || documentId}
      initialTitle={document.title}
      projectId={document.project_id}
      projectName={document.project_name}
      isTeamMember={document.is_team_member}
      canEdit={document.can_edit ?? document.is_team_member}
      initialContentJson={document.content_json}
    />
  );
}
