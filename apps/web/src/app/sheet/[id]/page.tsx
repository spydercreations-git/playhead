"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/use-auth";
import { apiRequest } from "@/lib/api";
import { SpreadsheetEditor } from "@/components/spreadsheets/spreadsheet-editor";
import { Loader2, FileQuestion, ArrowLeft } from "@/components/ui/icon";
import Link from "next/link";

interface SpreadsheetDetail {
  id: string;
  title: string;
  project_id?: string;
  project_name?: string;
  client_id?: string;
  client_name?: string;
  sheets: any[];
  can_edit: boolean;
  is_team_member: boolean;
}

export default function SheetPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isClient, isLoading: authLoading } = useAuth();
  const sheetId = params?.id as string;

  const [sheetData, setSheetData] = useState<SpreadsheetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    if (!sheetId) return;

    let isMounted = true;
    async function loadSpreadsheet() {
      try {
        setLoading(true);
        setError(null);

        // Fetch spreadsheet metadata and initial sheets data
        const data = await apiRequest<SpreadsheetDetail>(`/spreadsheets/${sheetId}`);

        if (isMounted) {
          setSheetData(data);
        }
      } catch (err: any) {
        console.error("Failed to load spreadsheet", err);
        if (isMounted) {
          setError(
            err.message ||
              "Spreadsheet not found or you do not have permission to view it."
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadSpreadsheet();
    return () => {
      isMounted = false;
    };
  }, [sheetId, user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#181818] text-white">
        <Loader2 className="w-8 h-8 text-[#3B67E0] animate-spin mb-3" />
        <span className="text-xs text-[#A3A6AD] font-medium">
          Loading spreadsheet...
        </span>
      </div>
    );
  }

  if (error || !sheetData) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#181818] text-white p-4">
        <div className="max-w-md w-full p-8 rounded-xl border border-[#2E2F34] bg-[#212121] text-center shadow-overlay">
          <div className="w-12 h-12 rounded-xl bg-red-950/40 text-red-400 flex items-center justify-center mx-auto mb-4 border border-red-900/30">
            <FileQuestion className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-white mb-2">
            Unable to open spreadsheet
          </h2>
          <p className="text-xs text-[#A3A6AD] mb-6">
            {error || "The requested spreadsheet does not exist or access was restricted."}
          </p>
          <Link
            href="/spreadsheets"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2A2B30] hover:bg-[#2E2F34] text-xs font-semibold text-white transition-colors border border-[#2E2F34]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Spreadsheets</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SpreadsheetEditor
      id={sheetId}
      initialData={sheetData}
      isTeamMember={sheetData.is_team_member}
      canEdit={sheetData.can_edit}
      user={user}
    />
  );
}
