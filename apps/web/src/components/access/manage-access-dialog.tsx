"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  ChevronDown,
  Users,
  Trash2,
} from "@/components/ui/icon";

export interface MemberAccess {
  id: string;
  name?: string;
  email: string;
  level: "full" | "editor" | "uploader" | "commenter" | "viewer";
  can_download: boolean;
  inherited_from?: string; // e.g. "Company Leadership" or "Client"
}

export interface SuggestedContact {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface ManageAccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  members?: MemberAccess[];
  suggested?: SuggestedContact[];
  onAddMember?: (
    email: string,
    level: string,
    canDownload: boolean,
    message?: string
  ) => Promise<void>;
  onUpdateMemberLevel?: (memberId: string, level: string) => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
  isLoading?: boolean;
}

export function ManageAccessDialog({
  isOpen,
  onClose,
  targetName,
  members = [],
  suggested = [],
  onAddMember,
  onUpdateMemberLevel,
  onRemoveMember,
  isLoading = false,
}: ManageAccessDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<SuggestedContact | null>(null);
  const [accessLevel, setAccessLevel] = useState<"full" | "editor" | "uploader" | "commenter" | "viewer">("commenter");
  const [canDownload, setCanDownload] = useState(true);
  const [message, setMessage] = useState("");
  const [isManagingMembers, setIsManagingMembers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async () => {
    const targetEmail = selectedContact ? selectedContact.email : query.trim();
    if (!targetEmail || !onAddMember) return;
    setSubmitting(true);
    try {
      await onAddMember(targetEmail, accessLevel, canDownload, message);
      setQuery("");
      setSelectedContact(null);
      setMessage("");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSuggested = suggested.filter(
    (s) =>
      !members.some((m) => m.email.toLowerCase() === s.email.toLowerCase()) &&
      (s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.email.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
      />

      {/* Dialog Body */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="relative z-10 w-full max-w-lg rounded-xl border border-[#2E2F34] bg-[#212121] shadow-overlay flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Header with Project Logo and "Add to {name}" */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2E2F34] bg-[#212121]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-[#4876F3]/15 border border-[#4876F3]/30 flex items-center justify-center text-[#4876F3] font-bold text-xs">
              {targetName.slice(0, 2)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Add to {targetName}</h3>
              <p className="text-xs text-[#A3A6AD]">Manage access and permissions</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#A3A6AD] hover:text-white hover:bg-[#2A2B30] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name or Email Input + Access Level Dropdown + Can Download switch */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={selectedContact ? selectedContact.name : query}
                  onChange={(e) => {
                    setSelectedContact(null);
                    setQuery(e.target.value);
                  }}
                  placeholder="Name or email"
                  className="w-full h-9 rounded-xl bg-[#2A2B30] border border-[#2E2F34] px-3 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
                />
                {selectedContact && (
                  <button
                    type="button"
                    onClick={() => setSelectedContact(null)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7C7F87] hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Access Level Dropdown */}
              <div className="relative">
                <select
                  value={accessLevel}
                  onChange={(e) => setAccessLevel(e.target.value as any)}
                  className="h-9 rounded-xl bg-[#2A2B30] border border-[#2E2F34] pl-3 pr-7 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none"
                >
                  <option value="full">Full</option>
                  <option value="editor">Editor</option>
                  <option value="uploader">Uploader</option>
                  <option value="commenter">Commenter</option>
                  <option value="viewer">Viewer</option>
                </select>
                <ChevronDown className="w-3 h-3 text-[#7C7F87] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Hint + Can Download switch */}
            <div className="flex items-center justify-between text-xs text-[#A3A6AD] px-1">
              <span>Add a new or existing member</span>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={canDownload}
                  onChange={(e) => setCanDownload(e.target.checked)}
                  className="rounded border-[#2E2F34] text-[#4876F3] focus:ring-0"
                />
                <span>Can download</span>
              </label>
            </div>
          </div>

          {/* Suggested List (team and client contacts) */}
          {filteredSuggested.length > 0 && !selectedContact && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[#7C7F87]">
                Suggested
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto rounded-xl border border-[#2E2F34] bg-[#181818] p-1.5">
                {filteredSuggested.slice(0, 4).map((s) => (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSelectedContact(s);
                      setQuery("");
                    }}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-[#2A2B30] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-full bg-[#4876F3] text-white text-xs font-bold flex items-center justify-center">
                        {s.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white leading-none">{s.name}</p>
                        <p className="text-xs text-[#7C7F87] leading-none mt-1">{s.email}</p>
                      </div>
                    </div>
                    {s.role && (
                      <span className="text-xs px-2 py-0.5 rounded bg-[#2E2F34] text-[#A3A6AD]">
                        {s.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message Area */}
          <div className="space-y-1.5">
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              className="w-full rounded-xl bg-[#2A2B30] border border-[#2E2F34] p-3 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] resize-none"
            />
          </div>

          {/* Separate Card: "{n} members · Manage" */}
          <div className="rounded-xl border border-[#2E2F34] bg-[#181818] p-3.5 space-y-3">
            <div
              onClick={() => setIsManagingMembers(!isManagingMembers)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#4876F3]" />
                <span className="text-xs font-semibold text-white">
                  {members.length} {members.length === 1 ? "member" : "members"}
                </span>
              </div>
              <span className="text-xs font-semibold text-[#4876F3] hover:underline">
                {isManagingMembers ? "Collapse" : "Manage"}
              </span>
            </div>

            {/* Expanded Members List */}
            {isManagingMembers && (
              <div className="space-y-2 pt-2 border-t border-[#2E2F34]">
                {members.length === 0 ? (
                  <p className="text-xs text-[#7C7F87] text-center py-2">
                    No individual members added.
                  </p>
                ) : (
                  members.map((m) => {
                    const isInherited = !!m.inherited_from;
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between p-2 rounded-lg ${
                          isInherited ? "opacity-60 bg-[#212121]" : "bg-[#2A2B30]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <div className="h-6 w-6 rounded-full bg-[#4876F3] text-white text-xs font-bold flex items-center justify-center shrink-0">
                            {(m.name || m.email).slice(0, 1)}
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-medium text-white truncate leading-none">
                              {m.name || m.email}
                            </p>
                            {isInherited && (
                              <p className="text-xs text-[#7C7F87] leading-none mt-1">
                                Inherited from {m.inherited_from}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isInherited ? (
                            <span className="text-xs text-[#A3A6AD] capitalize px-2">
                              {m.level}
                            </span>
                          ) : (
                            <>
                              <select
                                value={m.level}
                                onChange={(e) =>
                                  onUpdateMemberLevel?.(m.id, e.target.value)
                                }
                                className="h-7 rounded-lg bg-[#212121] border border-[#2E2F34] px-2 text-xs text-white focus:outline-none"
                              >
                                <option value="full">Full</option>
                                <option value="editor">Editor</option>
                                <option value="uploader">Uploader</option>
                                <option value="commenter">Commenter</option>
                                <option value="viewer">Viewer</option>
                              </select>
                              {onRemoveMember && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveMember(m.id)}
                                  className="p-1 rounded text-[#7C7F87] hover:text-rose-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer: Cancel and Add */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#2E2F34] bg-[#212121]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-[#2E2F34] bg-[#2A2B30] text-xs font-semibold text-[#A3A6AD] hover:bg-[#2E2F34] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || (!selectedContact && !query.trim())}
            onClick={handleAdd}
            className="h-9 px-5 rounded-xl bg-[#4876F3] text-xs font-semibold text-white hover:bg-[#3B67E0] transition-colors disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
