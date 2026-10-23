"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  ChevronDown,
  Users,
  Trash2,
  Plus,
  UserPlus,
} from "@/components/ui/icon";
import { UserAvatar, ClientAvatar } from "@/components/ui/avatar";
import { EntityPicker, PickerEntity } from "@/components/pickers/entity-picker";

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
  const [chosenPeople, setChosenPeople] = useState<PickerEntity[]>([]);
  const [showAddPeoplePicker, setShowAddPeoplePicker] = useState(false);
  const [selectedContact, setSelectedContact] = useState<SuggestedContact | null>(null);
  const [accessLevel, setAccessLevel] = useState<"full" | "editor" | "uploader" | "commenter" | "viewer">("commenter");
  const [canDownload, setCanDownload] = useState(true);
  const [message, setMessage] = useState("");
  const [isManagingMembers, setIsManagingMembers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const disabledMemberIds = members.map((m) => m.id);
  const disabledMemberEmails = members.map((m) => m.email.toLowerCase());

  const handleAdd = async () => {
    if (!onAddMember) return;
    setSubmitting(true);
    try {
      if (chosenPeople.length > 0) {
        for (const person of chosenPeople) {
          const email = person.email || person.name;
          await onAddMember(email, accessLevel, canDownload, message);
        }
      } else {
        const targetEmail = selectedContact ? selectedContact.email : query.trim();
        if (targetEmail) {
          await onAddMember(targetEmail, accessLevel, canDownload, message);
        }
      }
      setQuery("");
      setChosenPeople([]);
      setSelectedContact(null);
      setMessage("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveChosenPerson = (id: string) => {
    setChosenPeople((prev) => prev.filter((p) => p.id !== id));
  };

  const filteredSuggested = suggested.filter(
    (s) =>
      !members.some((m) => m.email.toLowerCase() === s.email.toLowerCase()) &&
      (s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.email.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80"
        />

        {/* Dialog Body */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-overlay flex flex-col overflow-hidden max-h-[90vh]"
        >
          {/* Header with Project Logo and "Add to {name}" */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--panel)]">
            <div className="flex items-center gap-3">
              <ClientAvatar name={targetName} size={32} />
              <div>
                <h3 className="text-sm font-bold text-white">Add to {targetName}</h3>
                <p className="text-xs text-[var(--text-2)]">Manage access and permissions</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-white hover:bg-[var(--input)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Add People Row: Button to open P2 Picker + Access Level dropdown */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPeoplePicker(true)}
                  className="flex-1 h-9 rounded-xl bg-[var(--input)] border border-[var(--border)] hover:border-[var(--accent)] px-3 text-xs text-left text-[var(--text-2)] hover:text-white flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  <span>Choose team members or client contacts...</span>
                </button>

                {/* Access Level Dropdown */}
                <div className="relative shrink-0">
                  <select
                    value={accessLevel}
                    onChange={(e) => setAccessLevel(e.target.value as any)}
                    className="h-9 rounded-xl bg-[var(--input)] border border-[var(--border)] pl-3 pr-7 text-xs text-white focus:outline-none focus:border-[var(--accent)] appearance-none cursor-pointer"
                  >
                    <option value="full">Full</option>
                    <option value="editor">Editor</option>
                    <option value="uploader">Uploader</option>
                    <option value="commenter">Commenter</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-[var(--text-3)] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Chosen People Tags from Picker */}
              {chosenPeople.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-[var(--bg)] border border-[var(--border)]">
                  {chosenPeople.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-md bg-[var(--hover)] border border-[var(--border)] text-xs text-white"
                    >
                      <UserAvatar
                        id={p.id}
                        name={p.name}
                        email={p.email}
                        avatarUrl={p.picture_url}
                        size={18}
                      />
                      <span className="max-w-[130px] truncate">{p.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveChosenPerson(p.id)}
                        className="p-0.5 text-[var(--text-3)] hover:text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* External Email Input (Fallback / Optional) */}
              <div className="relative">
                <input
                  type="text"
                  value={selectedContact ? selectedContact.name : query}
                  onChange={(e) => {
                    setSelectedContact(null);
                    setQuery(e.target.value);
                  }}
                  placeholder="Or invite by email address..."
                  className="w-full h-8 rounded-lg bg-[var(--input)]/60 border border-[var(--border)] px-3 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)]"
                />
                {selectedContact && (
                  <button
                    type="button"
                    onClick={() => setSelectedContact(null)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Hint + Can Download switch */}
              <div className="flex items-center justify-between text-xs text-[var(--text-2)] px-1 pt-0.5">
                <span>Add people with chosen access level</span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={canDownload}
                    onChange={(e) => setCanDownload(e.target.checked)}
                    className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-0"
                  />
                  <span>Can download</span>
                </label>
              </div>
            </div>
          {/* Suggested List (team and client contacts) */}
          {filteredSuggested.length > 0 && !selectedContact && chosenPeople.length === 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[var(--text-3)]">
                Suggested
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1.5">
                {filteredSuggested.slice(0, 4).map((s) => (
                  <div
                    key={s.id}
                    onClick={() => {
                      setSelectedContact(s);
                      setQuery("");
                    }}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--input)] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <UserAvatar id={s.id} name={s.name} email={s.email} size={24} />
                      <div>
                        <p className="text-xs font-semibold text-white leading-none">{s.name}</p>
                        <p className="text-xs text-[var(--text-3)] leading-none mt-1">{s.email}</p>
                      </div>
                    </div>
                    {s.role && (
                      <span className="text-xs px-2 py-0.5 rounded bg-[var(--border)] text-[var(--text-2)]">
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
              className="w-full rounded-xl bg-[var(--input)] border border-[var(--border)] p-3 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          {/* Separate Card: "{n} members · Manage" */}
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3.5 space-y-3">
            <div
              onClick={() => setIsManagingMembers(!isManagingMembers)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[var(--accent)]" />
                <span className="text-xs font-semibold text-white">
                  {members.length} {members.length === 1 ? "member" : "members"}
                </span>
              </div>
              <span className="text-xs font-semibold text-[var(--accent)] hover:underline">
                {isManagingMembers ? "Collapse" : "Manage"}
              </span>
            </div>

            {/* Expanded Members List */}
            {isManagingMembers && (
              <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                {members.length === 0 ? (
                  <p className="text-xs text-[var(--text-3)] text-center py-2">
                    No individual members added.
                  </p>
                ) : (
                  members.map((m) => {
                    const isInherited = !!m.inherited_from;
                    return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between p-2 rounded-lg ${
                          isInherited ? "bg-[var(--panel)] border border-[var(--border)]" : "bg-[var(--input)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                          <UserAvatar id={m.id} name={m.name} email={m.email} size={24} />
                          <div className="truncate">
                            <p className="text-xs font-medium text-white truncate leading-none">
                              {m.name || m.email}
                            </p>
                            {isInherited && (
                              <p className="text-xs text-[var(--text-2)] leading-none mt-1">
                                Inherited from {m.inherited_from}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isInherited ? (
                            <span className="text-xs text-[var(--text-2)] capitalize px-2">
                              {m.level}
                            </span>
                          ) : (
                            <>
                              <select
                                value={m.level}
                                onChange={(e) =>
                                  onUpdateMemberLevel?.(m.id, e.target.value)
                                }
                                className="h-7 rounded-lg bg-[var(--panel)] border border-[var(--border)] px-2 text-xs text-white focus:outline-none"
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
                                  className="p-1 rounded text-[var(--text-3)] hover:text-rose-400"
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
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] bg-[var(--panel)]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 rounded-xl border border-[var(--border)] bg-[var(--input)] text-xs font-semibold text-[var(--text-2)] hover:bg-[var(--border)] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || (chosenPeople.length === 0 && !selectedContact && !query.trim())}
            onClick={handleAdd}
            className="h-9 px-5 rounded-xl bg-[var(--button)] text-xs font-semibold text-white hover:bg-[var(--button-hover)] transition-colors disabled:opacity-50 cursor-pointer"
          >
            {submitting ? "Adding..." : chosenPeople.length > 0 ? `Add (${chosenPeople.length})` : "Add"}
          </button>
        </div>
      </motion.div>
    </div>

    {/* P2 Picker - Add people */}
    <EntityPicker
      isOpen={showAddPeoplePicker}
      onClose={() => setShowAddPeoplePicker(false)}
      tabs={["staff", "editors", "client_people"]}
      mode="multi"
      title="Add people"
      subtitle="Choose team members or client contacts to add."
      disabledIds={[...disabledMemberIds, ...disabledMemberEmails]}
      disabledReason="Already has access"
      primaryButtonText={(count) =>
        count > 0 ? `Add ${count} ${count === 1 ? "person" : "people"}` : "Add people"
      }
      onConfirm={(entities) => {
        setChosenPeople((prev) => {
          const next = [...prev];
          for (const ent of entities) {
            if (!next.some((p) => p.id === ent.id)) {
              next.push(ent);
            }
          }
          return next;
        });
      }}
    />
  </>
  );
}
