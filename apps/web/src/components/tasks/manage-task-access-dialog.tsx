"use client";

import React, { useState, useEffect } from "react";
import { apiRequest } from "@/lib/api";
import { Search, X, Check, UserPlus, Trash2, Loader2, ShieldCheck, Edit3 } from "@/components/ui/icon";

interface Member {
  user_id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
}

interface Assignee {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string;
}

interface ManageTaskAccessDialogProps {
  taskId: string;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export function ManageTaskAccessDialog({
  taskId,
  open,
  onClose,
  onUpdated,
}: ManageTaskAccessDialogProps) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [candidates, setCandidates] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    Promise.all([
      apiRequest<{ task: { assigned: Assignee[] } }>(`/tasks/${taskId}`),
      apiRequest<{ members: Member[] }>("/admin/members"),
    ])
      .then(([taskRes, membersRes]) => {
        setAssignees(taskRes.task.assigned || []);
        // Only staff and editors can be assigned to tasks
        const validMembers = (membersRes.members || []).filter(
          (m) => m.role.toLowerCase() === "staff" || m.role.toLowerCase() === "editor"
        );
        setCandidates(validMembers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, taskId]);

  if (!open) return null;

  const assignedUserIds = new Set(assignees.map((a) => a.id));

  const filteredCandidates = candidates.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleToggleAssignee(member: Member) {
    setSaving(true);
    const isAssigned = assignedUserIds.has(member.user_id);
    try {
      if (isAssigned) {
        await apiRequest(`/tasks/${taskId}/assignees/${member.user_id}`, {
          method: "DELETE",
        });
        setAssignees((prev) => prev.filter((a) => a.id !== member.user_id));
      } else {
        await apiRequest(`/tasks/${taskId}/assignees`, {
          method: "POST",
          body: JSON.stringify({ user_id: member.user_id }),
        });
        setAssignees((prev) => [
          ...prev,
          {
            id: member.user_id,
            name: member.name,
            email: member.email,
            role: member.role,
            avatar_url: member.avatar_url,
          },
        ]);
      }
      onUpdated();
    } catch (err: any) {
      alert(err.message || "Failed to update access");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-[12px] bg-[var(--panel-raised)] border border-[var(--border)] shadow-overlay overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-semibold text-white">Manage task access</h2>
            <p className="text-xs text-[var(--text-3)] mt-0.5">
              Assign staff and editors to this task. Clients never see this list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[6px] text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[var(--border)] bg-[var(--panel)]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[var(--text-3)] absolute left-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search staff and editors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[var(--input)] border border-[var(--border)] rounded-[8px] pl-9 pr-3 py-1.5 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        {/* Members list */}
        <div className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--border)]/40">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--text-3)] gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--primary)]" />
              Loading team members...
            </div>
          ) : filteredCandidates.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-3)]">
              No matching members found.
            </div>
          ) : (
            filteredCandidates.map((member) => {
              const isAssigned = assignedUserIds.has(member.user_id);
              const isEditor = member.role.toLowerCase() === "editor";
              return (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between px-3 py-2.5 rounded-[8px] hover:bg-[var(--hover)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[var(--hover)] flex items-center justify-center text-xs font-semibold text-white shrink-0">
                      {member.name ? member.name.charAt(0).toUpperCase() : "U"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-white truncate">
                          {member.name}
                        </span>
                        <span
                          className={`text-[12px] px-1.5 py-0.2 rounded-full font-medium ${
                            isEditor
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-blue-500/10 text-blue-400"
                          }`}
                        >
                          {member.role}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--text-3)] truncate">
                        {member.email}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleToggleAssignee(member)}
                    className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-colors flex items-center gap-1 ${
                      isAssigned
                        ? "bg-emerald-500/15 text-emerald-400 hover:bg-red-500/20 hover:text-red-400"
                        : "bg-[var(--input)] text-[var(--text-2)] hover:text-white hover:bg-[var(--primary)]"
                    }`}
                  >
                    {isAssigned ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Assigned
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5" />
                        Assign
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--panel)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-[8px] text-xs font-medium bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
