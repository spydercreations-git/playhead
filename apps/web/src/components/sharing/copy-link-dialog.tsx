"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { X, Lock, Check, Link as LinkIcon, Loader2 } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";

function GlobeIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

interface CopyLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  itemId?: string;
  itemName?: string;
  onOpenManageAccess?: () => void;
}

export function CopyLinkDialog({
  isOpen,
  onClose,
  projectId,
  projectName,
  itemId,
  itemName,
  onOpenManageAccess,
}: CopyLinkDialogProps) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [audience, setAudience] = useState<"people_with_access" | "anyone_with_link">("people_with_access");
  const [linkToken, setLinkToken] = useState<string>("");

  // Fetch existing share links or create default
  const { data: linksData, isLoading } = useQuery<{ share_links?: any[]; links?: any[] }>({
    queryKey: ["share-links", projectId, itemId],
    queryFn: () => apiRequest(`/projects/${projectId}/share-links`),
    enabled: isOpen && !!projectId,
  });

  const existingLinks = linksData?.share_links || linksData?.links || [];
  const currentLink = existingLinks[0];

  useEffect(() => {
    if (currentLink) {
      if (currentLink.audience === "anyone_with_link") {
        setAudience("anyone_with_link");
      } else {
        setAudience("people_with_access");
      }
      setLinkToken(currentLink.token || currentLink.id);
    }
  }, [currentLink]);

  // Fetch project members / people with access for the bottom row
  const { data: projectData } = useQuery<{
    project?: { people?: any[] };
    people?: any[];
  }>({
    queryKey: ["project-access-people", projectId],
    queryFn: () => apiRequest(`/projects/${projectId}`),
    enabled: isOpen && !!projectId,
  });

  const people = projectData?.project?.people || projectData?.people || [];

  // Mutation to create or update share link audience
  const updateLinkMutation = useMutation({
    mutationFn: async (newAudience: "people_with_access" | "anyone_with_link") => {
      if (currentLink?.id) {
        return apiRequest(`/share-links/${currentLink.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            audience: newAudience,
            access: "view",
          }),
        });
      } else {
        return apiRequest(`/projects/${projectId}/share-links`, {
          method: "POST",
          body: JSON.stringify({
            name: itemName || projectName || "Share Link",
            target_type: itemId ? "item" : "project",
            target_id: itemId || projectId,
            item_ids: itemId ? [itemId] : [],
            audience: newAudience,
            access: "view",
            allow_download: newAudience === "people_with_access",
          }),
        });
      }
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["share-links", projectId] });
      if (data?.token) {
        setLinkToken(data.token);
      }
    },
  });

  function handleAudienceChange(newAud: "people_with_access" | "anyone_with_link") {
    setAudience(newAud);
    updateLinkMutation.mutate(newAud);
  }

  // Construct URL matching L5 design
  const origin = typeof window !== "undefined" ? window.location.origin : "https://playhead.idyllproductions.com";
  const displayUrl = linkToken
    ? `${origin.replace(/^https?:\/\//, "")}/s/${linkToken}`
    : `${origin.replace(/^https?:\/\//, "")}/projects/${projectId}`;
  const fullUrl = linkToken ? `${origin}/s/${linkToken}` : `${origin}/projects/${projectId}`;

  function handleCopy() {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in-0 duration-150">
      <div
        className="w-full max-w-[480px] rounded-[14px] border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in fade-in duration-150 flex flex-col gap-5 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Copy link</h2>
            <p className="text-xs text-[var(--text-2)] mt-0.5">{itemName || projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--hover)] hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* URL Box with Copy button */}
        <div className="flex items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3 py-1.5 focus-within:border-[#4876F3] transition-colors">
          <LinkIcon size={16} className="text-[var(--text-3)] shrink-0" />
          <input
            type="text"
            readOnly
            value={displayUrl}
            className="flex-1 bg-transparent text-xs text-[var(--text-2)] font-mono focus:outline-none select-all truncate"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="h-8 px-4 rounded-[8px] bg-[#4876F3] hover:bg-[#3B67E0] text-xs font-semibold text-white transition-colors shrink-0 flex items-center gap-1.5 shadow-[0_2px_8px_rgba(72,118,243,0.3)]"
          >
            {copied ? (
              <>
                <Check size={16} />
                <span>Copied</span>
              </>
            ) : (
              <span>Copy</span>
            )}
          </button>
        </div>

        {/* Who can open this link options */}
        <div className="flex flex-col gap-2.5">
          <label className="text-xs font-semibold text-[var(--text-2)]">Who can open this link</label>

          {/* Option 1: People with access */}
          <div
            onClick={() => handleAudienceChange("people_with_access")}
            className={`flex items-start gap-3.5 p-3.5 rounded-[10px] border cursor-pointer transition-all ${
              audience === "people_with_access"
                ? "border-[#4876F3] bg-[#4876F3]/10"
                : "border-[var(--border)] bg-[var(--panel-raised)] hover:bg-[var(--hover)] hover:border-[var(--border-strong)]"
            }`}
          >
            <div className="pt-0.5 shrink-0">
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                  audience === "people_with_access"
                    ? "border-[#4876F3] bg-[#4876F3]"
                    : "border-[var(--text-3)] bg-transparent"
                }`}
              >
                {audience === "people_with_access" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--panel)] border border-[var(--border)] shrink-0 text-[var(--text-2)]">
              <Lock size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">People with access</p>
              <p className="text-xs text-[var(--text-2)] mt-0.5 leading-relaxed">
                Only people added in Manage access. Others see &ldquo;No access&rdquo;.
              </p>
            </div>
          </div>

          {/* Option 2: Anyone with the link */}
          <div
            onClick={() => handleAudienceChange("anyone_with_link")}
            className={`flex items-start gap-3.5 p-3.5 rounded-[10px] border cursor-pointer transition-all ${
              audience === "anyone_with_link"
                ? "border-[#4876F3] bg-[#4876F3]/10"
                : "border-[var(--border)] bg-[var(--panel-raised)] hover:bg-[var(--hover)] hover:border-[var(--border-strong)]"
            }`}
          >
            <div className="pt-0.5 shrink-0">
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                  audience === "anyone_with_link"
                    ? "border-[#4876F3] bg-[#4876F3]"
                    : "border-[var(--text-3)] bg-transparent"
                }`}
              >
                {audience === "anyone_with_link" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--panel)] border border-[var(--border)] shrink-0 text-[var(--text-2)]">
              <GlobeIcon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Anyone with the link (view only)</p>
              <p className="text-xs text-[var(--text-2)] mt-0.5 leading-relaxed">
                Preview without signing in. No comments, no download.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5 overflow-hidden">
              {people.slice(0, 4).map((p: any, idx: number) => (
                <div
                  key={p.id || idx}
                  className="w-5 h-5 rounded-full ring-2 ring-[var(--panel)] bg-[#4876F3] text-xs font-bold text-white flex items-center justify-center"
                >
                  {(p.name || p.email || "U").slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
            <span className="text-xs text-[var(--text-2)]">
              {people.length > 0 ? `${people.length} people have access` : "Project team has access"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {onOpenManageAccess && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenManageAccess();
                }}
                className="text-xs font-semibold text-[#4876F3] hover:underline"
              >
                Manage access
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 rounded-[8px] bg-[#4876F3] hover:bg-[#3B67E0] text-xs font-semibold text-white transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
