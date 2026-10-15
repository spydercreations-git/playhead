"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Lock,
  ChevronDown,
  Check,
  User,
  Users,
  Shield,
  Trash2,
  Sparkles,
} from "lucide-react";

interface MemberAccess {
  id: string;
  name?: string;
  email: string;
  level: "full" | "uploader" | "commenter" | "viewer";
  can_download: boolean;
  inherited_from?: string; // e.g. "Company Admin" or "Client"
}

interface SuggestedContact {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface ManageAccessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  targetName: string;
  isRestricted?: boolean;
  onToggleRestricted?: (val: boolean) => void;
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
  isRestricted = false,
  onToggleRestricted,
  members = [],
  suggested = [],
  onAddMember,
  onUpdateMemberLevel,
  onRemoveMember,
  isLoading = false,
}: ManageAccessDialogProps) {
  const [restricted, setRestricted] = useState(isRestricted);
  const [query, setQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<SuggestedContact | null>(null);
  const [accessLevel, setAccessLevel] = useState<"full" | "uploader" | "commenter" | "viewer">("commenter");
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

  const handleToggleRestrictedSwitch = (newVal: boolean) => {
    setRestricted(newVal);
    onToggleRestricted?.(newVal);
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
        className="relative z-10 w-full max-w-lg rounded-2xl border border-[#2E2F34] bg-[#212121] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
      >
        {/* Header with Project Logo and "Add to {name}" */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2E2F34] bg-[#212121]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-[#4876F3]/15 border border-[#4876F3]/30 flex items-center justify-center text-[#4876F3] font-bold text-xs uppercase">
              {targetName.slice(0, 2)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Add to {targetName}</h3>
              <p className="text-[11px] text-[#9A9DA0]">Manage access and permissions</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9A9DA0] hover:text-white hover:bg-[#2A2B30] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Restricted Switch */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#2E2F34] bg-[#1C1C1E]">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 mt-0.5">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Restricted access</p>
                <p className="text-[11px] text-[#9A9DA0] mt-0.5 leading-snug">
                  Only people added here and Admins can see this
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleToggleRestrictedSwitch(!restricted)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                restricted ? "bg-[#4876F3]" : "bg-[#2E2F34]"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  restricted ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

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
                  <option value="full">Full access</option>
                  <option value="uploader">Uploader</option>
                  <option value="commenter">Commenter</option>
                  <option value="viewer">Viewer</option>
                </select>
                <ChevronDown className="w-3 h-3 text-[#7C7F87] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Hint + Can Download switch */}
            <div className="flex items-center justify-between text-[11px] text-[#9A9DA0] px-1">
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
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7C7F87]">
                Suggested
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto rounded-xl border border-[#2E2F34] bg-[#1C1C1E] p-1.5">
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
                      <div className="h-6 w-6 rounded-full bg-[#4876F3] text-white text-[10px] font-bold flex items-center justify-center uppercase">
                        {s.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white leading-none">{s.name}</p>
                        <p className="text-[10px] text-[#7C7F87] leading-none mt-1">{s.email}</p>
                      </div>
                    </div>
                    {s.role && (
                      <span className="text-[10px] text-[#7C7F87] bg-[#2E2F34] px-1.5 py-0.5 rounded">
                        {s.role}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Optional Message */}
          <div>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a message (optional)"
              className="w-full rounded-xl bg-[#2A2B30] border border-[#2E2F34] p-3 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] resize-none"
            />
          </div>

          {/* Restricted Access Toggle Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl border border-[#2E2F34] bg-[#1C1C1E] p-3.5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[#2A2B30] flex items-center justify-center text-[#9A9DA0] shrink-0">
                  <Lock className={`w-4 h-4 ${restricted ? "text-amber-400" : "text-[#7C7F87]"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-white">Restricted access</h4>
                    {restricted && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        ON
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#9A9DA0]">
                    Only invited members and Admins can access
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={restricted}
                onClick={() => handleToggleRestrictedSwitch(!restricted)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  restricted ? "bg-[#3B67E0]" : "bg-[#2E2F34]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    restricted ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Warning banner when toggled ON */}
            {restricted && members.filter((m) => !!m.inherited_from).length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {members.filter((m) => !!m.inherited_from).length}{" "}
                    {members.filter((m) => !!m.inherited_from).length === 1 ? "person" : "people"} will lose access
                  </span>
                </div>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  Inherited company and client members will no longer have access. Only Admins and explicitly invited people can view this.
                </p>
                <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                  {members
                    .filter((m) => !!m.inherited_from)
                    .map((m) => (
                      <div
                        key={m.id}
                        title={m.name || m.email}
                        className="h-6 w-6 rounded-full bg-[#2A2B30] border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center justify-center shrink-0 uppercase"
                      >
                        {(m.name || m.email).slice(0, 1)}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Separate Card: "{n} members · Manage" */}
          <div className="rounded-xl border border-[#2E2F34] bg-[#1C1C1E] p-3.5 space-y-3">
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
              <span className="text-[11px] font-semibold text-[#4876F3] hover:underline">
                {isManagingMembers ? "Collapse" : "Manage"}
              </span>
            </div>

            {/* Expanded Members List */}
            {isManagingMembers && (
              <div className="space-y-2 pt-2 border-t border-[#2E2F34]">
                {members.length === 0 ? (
                  <p className="text-[11px] text-[#7C7F87] text-center py-2">
                    No individual members added.
                  </p>
                ) : (
                  members.map((m) => {
                    const isInherited = !!m.inherited_from;
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between p-2 rounded-lg ${
                          isInherited ? "opacity-60 bg-[#252528]" : "bg-[#2A2B30]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <div className="h-6 w-6 rounded-full bg-[#4876F3] text-white text-[10px] font-bold flex items-center justify-center uppercase shrink-0">
                            {(m.name || m.email).slice(0, 1)}
                          </div>
                          <div className="truncate">
                            <p className="text-xs font-medium text-white truncate leading-none">
                              {m.name || m.email}
                            </p>
                            {isInherited && (
                              <p className="text-[10px] text-[#7C7F87] leading-none mt-1">
                                Inherited from {m.inherited_from}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isInherited ? (
                            <span className="text-[11px] text-[#9A9DA0] capitalize px-2">
                              {m.level}
                            </span>
                          ) : (
                            <>
                              <select
                                value={m.level}
                                onChange={(e) =>
                                  onUpdateMemberLevel?.(m.id, e.target.value)
                                }
                                className="h-7 rounded-lg bg-[#212121] border border-[#2E2F34] px-2 text-[11px] text-white focus:outline-none"
                              >
                                <option value="full">Full access</option>
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
            className="h-9 px-4 rounded-xl border border-[#2E2F34] bg-[#2A2B30] text-xs font-semibold text-[#D1D2D4] hover:bg-[#34353B] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={(!selectedContact && !query.trim()) || submitting}
            className={`h-9 px-5 rounded-xl text-xs font-semibold text-white transition-all shadow flex items-center justify-center ${
              (selectedContact || query.trim()) && !submitting
                ? "bg-[#3B67E0] hover:bg-[#4876F3] cursor-pointer"
                : "bg-[#2E2F34] text-[#7C7F87] cursor-not-allowed"
            }`}
          >
            {submitting ? "Adding..." : "Add"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
