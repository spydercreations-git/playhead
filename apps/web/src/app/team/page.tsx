"use client";

import React, { useState, useEffect } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { TeamIcon } from "@/components/icons";

interface Member {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: string;
  joined_at: string;
}

interface Invite {
  id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [currentRole, setCurrentRole] = useState<string>("member");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "guest">("member");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const maxTrialSeats = 5;
  const totalSeatsUsed = members.length + invites.length;
  const seatsRemaining = Math.max(0, maxTrialSeats - totalSeatsUsed);

  async function loadTeamData() {
    try {
      setLoading(true);
      setError(null);
      const me = await apiRequest("/auth/me");
      if (!me.companies || me.companies.length === 0) {
        setError("No company workspace found. Please complete onboarding first.");
        return;
      }

      const activeComp = me.companies[0];
      setCompanyId(activeComp.id);
      setCompanyName(activeComp.name);
      setCurrentRole(activeComp.role);
      setCurrentUserId(me.user.id);

      const [membersData, invitesData] = await Promise.all([
        apiRequest(`/companies/${activeComp.id}/members`),
        apiRequest(`/companies/${activeComp.id}/invites`).catch(() => []),
      ]);

      setMembers(membersData);
      setInvites(invitesData);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Failed to load team members.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeamData();
  }, []);

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;

    setInviteLoading(true);
    setInviteError(null);

    try {
      await apiRequest(`/companies/${companyId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      setInviteEmail("");
      setInviteModalOpen(false);
      loadTeamData();
    } catch (err: any) {
      const apiErr = err as ApiError;
      setInviteError(apiErr.error || "Unable to send invitation.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!companyId) return;
    if (!confirm("Are you sure you want to remove this member from the workspace?")) return;

    try {
      await apiRequest(`/companies/${companyId}/members/${userId}`, {
        method: "DELETE",
      });
      loadTeamData();
    } catch (err: any) {
      const apiErr = err as ApiError;
      alert(apiErr.error || "Failed to remove member.");
    }
  }

  async function handleUpdateRole(userId: string, newRole: string) {
    if (!companyId) return;

    try {
      await apiRequest(`/companies/${companyId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      loadTeamData();
    } catch (err: any) {
      const apiErr = err as ApiError;
      alert(apiErr.error || "Failed to update member role.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Team Members</h1>
            <span className="rounded-full bg-[#2E2F34] px-2.5 py-0.5 text-xs font-semibold text-[#9A9DA0]">
              {totalSeatsUsed} of {maxTrialSeats} seats
            </span>
          </div>
          <p className="mt-1 text-xs text-[#9A9DA0]">
            Manage collaborators in <span className="text-white font-medium">{companyName || "Workspace"}</span>. 14-day free trial allows up to 5 seats.
          </p>
        </div>

        <button
          onClick={() => setInviteModalOpen(true)}
          disabled={seatsRemaining === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#4876F3] px-4 py-2 text-sm font-semibold text-white shadow hover:bg-[#3b66df] disabled:opacity-40 disabled:hover:bg-[#4876F3] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Invite Member
        </button>
      </div>

      {/* Trial banner */}
      <div className="flex items-center justify-between rounded-xl border border-[#424344] bg-[#212121] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4876F3]/15 text-[#4876F3]">
            <TeamIcon size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">
              14-Day Agency Trial
            </div>
            <div className="text-xs text-[#9A9DA0]">
              {seatsRemaining > 0
                ? `${seatsRemaining} seats remaining out of ${maxTrialSeats} allowed during trial.`
                : "All 5 trial seats are occupied. Upgrade to add more teammates."}
            </div>
          </div>
        </div>
        <div className="hidden sm:block text-xs font-medium text-[#4876F3]">
          Full Features Active
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Members Table */}
      <div className="overflow-hidden rounded-xl border border-[#424344] bg-[#212121]">
        <div className="border-b border-[#424344] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Active Members</h2>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-[#4876F3] border-t-transparent" />
            <p className="text-xs text-[#9A9DA0]">Loading team...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#9A9DA0]">
            No members found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#424344] bg-[#181818]/50 text-[#9A9DA0]">
                <tr>
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                  <th className="px-6 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#424344]">
                {members.map((m) => {
                  const isSelf = m.user_id === currentUserId;
                  const isOwner = m.role === "owner";
                  return (
                    <tr key={m.user_id} className="hover:bg-[#2E2F34]/30 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4876F3] font-bold text-white text-xs">
                            {m.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-white">
                              {m.name} {isSelf && <span className="text-[#9A9DA0] font-normal">(you)</span>}
                            </div>
                            <div className="text-[#9A9DA0]">{m.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-3.5">
                        {isOwner || currentRole !== "owner" ? (
                          <span className="inline-flex rounded-full bg-[#2E2F34] px-2.5 py-0.5 text-[11px] font-semibold uppercase text-white">
                            {m.role}
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) => handleUpdateRole(m.user_id, e.target.value)}
                            className="rounded border border-[#424344] bg-[#2E2F34] px-2 py-1 text-xs text-white focus:outline-none"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="guest">Guest</option>
                          </select>
                        )}
                      </td>

                      <td className="px-6 py-3.5 text-[#9A9DA0]">
                        {new Date(m.joined_at).toLocaleDateString()}
                      </td>

                      <td className="px-6 py-3.5 text-right">
                        {!isOwner && !isSelf && (currentRole === "owner" || currentRole === "admin") && (
                          <button
                            onClick={() => handleRemoveMember(m.user_id)}
                            className="text-xs text-red-400 hover:text-red-300 hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[#424344] bg-[#212121]">
          <div className="border-b border-[#424344] px-6 py-4">
            <h2 className="text-sm font-semibold text-white">Pending Invitations</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#424344] bg-[#181818]/50 text-[#9A9DA0]">
                <tr>
                  <th className="px-6 py-3 font-medium">Invited Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Expires</th>
                  <th className="px-6 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#424344]">
                {invites.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#2E2F34]/30">
                    <td className="px-6 py-3.5 font-medium text-white">{inv.email}</td>
                    <td className="px-6 py-3.5">
                      <span className="inline-flex rounded-full bg-[#2E2F34] px-2.5 py-0.5 text-[11px] font-semibold uppercase text-white">
                        {inv.role}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-[#9A9DA0]">
                      {new Date(inv.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
                        Pending
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal Dialog */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-[440px] rounded-2xl border border-[#424344] bg-[#212121] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Invite Teammate</h3>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="text-[#9A9DA0] hover:text-white"
              >
                ✕
              </button>
            </div>

            {inviteError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#9A9DA0]">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="editor@agency.com"
                  className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#9A9DA0]">
                  Workspace role
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3 py-2.5 text-sm text-white focus:border-[#4876F3] focus:outline-none"
                >
                  <option value="admin">Admin (can manage members & settings)</option>
                  <option value="member">Member (can create projects & upload)</option>
                  <option value="guest">Guest (review and comment only)</option>
                </select>
              </div>

              <div className="rounded-lg border border-[#424344] bg-[#2E2F34]/50 p-3 text-xs text-[#9A9DA0]">
                Invite links expire after 7 days and can only be accepted by an account with the matching email.
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="rounded-lg border border-[#424344] bg-[#2E2F34] px-4 py-2 text-xs font-semibold text-white hover:bg-[#383a42]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="rounded-lg bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3b66df] disabled:opacity-50"
                >
                  {inviteLoading ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
