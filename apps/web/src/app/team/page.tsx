"use client";

import React, { useState, useEffect } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Shield, Plus, Trash2, Check, AlertCircle, X, Users, ChevronDown } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";

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

interface CustomRole {
  id: string;
  name: string;
  color: string;
  permissions: string[];
  is_system: boolean;
  member_count: number;
}

const PERMISSION_GROUPS = [
  {
    category: "Clients",
    perms: [
      { id: "clients.view_all", label: "View all clients" },
      { id: "clients.create", label: "Create clients" },
      { id: "clients.edit", label: "Edit clients" },
      { id: "clients.delete", label: "Delete clients" },
    ],
  },
  {
    category: "Projects",
    perms: [
      { id: "projects.view_all", label: "View all projects" },
      { id: "projects.create", label: "Create projects" },
      { id: "projects.archive", label: "Archive projects" },
      { id: "projects.delete", label: "Delete projects" },
      { id: "projects.manage_people", label: "Manage project members" },
    ],
  },
  {
    category: "Files & Storage",
    perms: [
      { id: "files.download_all", label: "Download all files" },
      { id: "files.delete_forever", label: "Delete files forever" },
      { id: "files.empty_trash", label: "Empty workspace trash" },
    ],
  },
  {
    category: "Sharing",
    perms: [
      { id: "sharing.create_public_links", label: "Create public share links" },
    ],
  },
  {
    category: "Team & Access",
    perms: [
      { id: "team.invite", label: "Invite new team members" },
      { id: "team.change_roles", label: "Change member roles & remove members" },
      { id: "team.manage_roles", label: "Create, edit & delete custom roles" },
    ],
  },
  {
    category: "Administration",
    perms: [
      { id: "admin.storage", label: "Manage storage quota & upgrades" },
      { id: "admin.settings", label: "Manage company settings & billing" },
    ],
  },
];

export default function TeamPage() {
  const [activeTab, setActiveTab] = useState<"members" | "roles">("members");

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [currentRole, setCurrentRole] = useState<string>("member");
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("Editor");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // New/Edit Role modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState("#4876F3");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  // Confirmation dialogs
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<{ id: string; name: string } | null>(null);

  const maxTrialSeats = 5;
  const totalSeatsUsed = (Array.isArray(members) ? members.length : 0) + (Array.isArray(invites) ? invites.length : 0);
  const seatsRemaining = Math.max(0, maxTrialSeats - totalSeatsUsed);
  const canChangeRoles = currentRole?.toLowerCase() === "ceo" || currentRole?.toLowerCase() === "coo";
  const canResend = ["ceo", "coo", "cfo", "chief sales officer", "design head", "project manager", "admin", "owner", "manager"].includes(currentRole?.toLowerCase());

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

      const [membersData, invitesData, rolesData] = await Promise.all([
        apiRequest(`/companies/${activeComp.id}/members`),
        apiRequest(`/companies/${activeComp.id}/invites`).catch(() => ({ invites: [] })),
        apiRequest("/roles").catch(() => []),
      ]);

      const rawMembers: any[] = Array.isArray(membersData)
        ? membersData
        : Array.isArray(membersData?.members)
        ? membersData.members
        : [];

      const parsedMembers: Member[] = rawMembers.map((m: any) => ({
        user_id: m.user_id || m.id,
        name: m.name || m.user_name || "Anonymous",
        email: m.email || m.user_email || "",
        avatar_url:
          typeof m.avatar_url === "string"
            ? m.avatar_url
            : typeof m.user_avatar_url === "string"
            ? m.user_avatar_url
            : m.user_avatar_url?.Valid
            ? m.user_avatar_url.String
            : "",
        role: m.role || "member",
        joined_at: m.joined_at || m.created_at || "",
      }));

      const rawInvites: any[] = Array.isArray(invitesData)
        ? invitesData
        : Array.isArray(invitesData?.invites)
        ? invitesData.invites
        : [];

      const parsedInvites: Invite[] = rawInvites.map((inv: any) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        created_at: inv.created_at,
        expires_at: inv.expires_at,
      }));

      const rawRoles: any[] = Array.isArray(rolesData)
        ? rolesData
        : Array.isArray(rolesData?.roles)
        ? rolesData.roles
        : [];

      setMembers(parsedMembers);
      setInvites(parsedInvites);
      setRoles(rawRoles);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Failed to load team data.");
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

  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);

  async function handleResendInvite(inviteId: string) {
    if (!companyId) return;
    try {
      setResendingInviteId(inviteId);
      await apiRequest(`/companies/${companyId}/invites/${inviteId}/resend`, {
        method: "POST",
      });
      toast.success("Invitation resent with new temporary password");
      loadTeamData();
    } catch (err: any) {
      const apiErr = err as ApiError;
      toast.error(apiErr.message || apiErr.error || "Failed to resend invitation.");
    } finally {
      setResendingInviteId(null);
    }
  }

  async function executeRemoveMember(userId: string) {
    if (!companyId) return;

    try {
      await apiRequest(`/companies/${companyId}/members/${userId}`, {
        method: "DELETE",
      });
      toast.success("Team member removed");
      loadTeamData();
    } catch (err: any) {
      const apiErr = err as ApiError;
      toast.error(apiErr.message || apiErr.error || "Failed to remove member.");
    }
  }

  async function handleUpdateRole(userId: string, newRole: string) {
    if (!companyId) return;

    try {
      await apiRequest(`/companies/${companyId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      toast.success("Member role updated");
      loadTeamData();
    } catch (err: any) {
      const apiErr = err as ApiError;
      toast.error(apiErr.message || apiErr.error || "Failed to update member role.");
    }
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    setRoleLoading(true);
    setRoleError(null);

    try {
      await apiRequest("/roles", {
        method: "POST",
        body: JSON.stringify({
          name: roleName.trim(),
          color: roleColor,
          permissions: selectedPerms,
        }),
      });
      setRoleName("");
      setSelectedPerms([]);
      setRoleModalOpen(false);
      toast.success("Custom role created");
      loadTeamData();
    } catch (err: any) {
      setRoleError(err.message || "Failed to create role");
    } finally {
      setRoleLoading(false);
    }
  }

  async function executeDeleteRole(roleId: string) {
    try {
      await apiRequest(`/roles/${roleId}`, { method: "DELETE" });
      toast.success("Role deleted");
      loadTeamData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete role");
    }
  }

  function togglePerm(permId: string) {
    if (selectedPerms.includes(permId)) {
      setSelectedPerms(selectedPerms.filter((p) => p !== permId));
    } else {
      setSelectedPerms([...selectedPerms, permId]);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Team & Permissions</h1>
            <span className="rounded-full bg-[var(--border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-2)]">
              {totalSeatsUsed} of {maxTrialSeats} seats
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--text-2)]">
            Manage members, invitations, and custom access roles in <span className="text-white font-medium">{companyName || "Workspace"}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "roles" ? (
            canChangeRoles && (
              <button
                onClick={() => setRoleModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3B67E0] transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Role
              </button>
            )
          ) : (
            <button
              onClick={() => setInviteModalOpen(true)}
              disabled={seatsRemaining === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3B67E0] disabled:opacity-40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Invite Member
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border-strong)]/60">
        <button
          onClick={() => setActiveTab("members")}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "members"
              ? "border-[#4876F3] text-white"
              : "border-transparent text-[var(--text-2)] hover:text-white"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Members ({(members || []).length})</span>
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "roles"
              ? "border-[#4876F3] text-white"
              : "border-transparent text-[var(--text-2)] hover:text-white"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Roles & Permissions ({(roles || []).length})</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-[#F0506E]/30 bg-[#F0506E]/10 p-4 text-xs text-[#F0506E]">
          {error}
        </div>
      )}

      {/* TAB 1: MEMBERS */}
      {activeTab === "members" && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--panel)]">
            <div className="border-b border-[var(--border-strong)] px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Active Members</h2>
              <span className="text-xs text-[var(--text-2)]">{(members || []).length} people</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-xs text-[var(--text-2)]">Loading members...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[var(--border-strong)] bg-[var(--bg)]/50 text-[var(--text-2)]">
                    <tr>
                      <th className="px-6 py-3 font-medium">User</th>
                      <th className="px-6 py-3 font-medium">Role</th>
                      <th className="px-6 py-3 font-medium">Joined</th>
                      <th className="px-6 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-strong)]">
                    {(members || []).map((m) => {
                      const isSelf = m.user_id === currentUserId;
                      return (
                        <tr key={m.user_id} className="hover:bg-[var(--border)]/30">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-[#4876F3]/20 text-[#4876F3] flex items-center justify-center font-bold text-xs ">
                                {m.name ? m.name.charAt(0).toUpperCase() : (m.email ? m.email.charAt(0).toUpperCase() : "?")}
                              </div>
                              <div>
                                <div className="font-semibold text-white">
                                  {m.name || "Anonymous"} {isSelf && "(You)"}
                                </div>
                                <div className="text-xs text-[var(--text-2)]">{m.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {canChangeRoles && !isSelf ? (
                              <select
                                value={m.role}
                                onChange={(e) => handleUpdateRole(m.user_id, e.target.value)}
                                className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg px-2.5 py-1 text-xs text-white"
                              >
                                <option value="CEO">CEO</option>
                                <option value="COO">COO</option>
                                <option value="CFO">CFO</option>
                                <option value="Chief Sales Officer">Chief Sales Officer</option>
                                <option value="Design Head">Design Head</option>
                                <option value="Project Manager">Project Manager</option>
                                <option value="Editor">Editor</option>
                                {(roles || [])
                                  .filter((r) => !r.is_system && !["ceo", "coo", "cfo", "chief sales officer", "design head", "project manager", "editor"].includes(r.name.toLowerCase()))
                                  .map((r) => (
                                    <option key={r.id} value={r.name}>
                                      {r.name}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--input)] text-xs font-medium text-white border border-[var(--border)]">
                                {m.role}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-[var(--text-2)]">
                            {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "Active"}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {canChangeRoles && !isSelf && (
                              <button
                                onClick={() => setMemberToRemove({ id: m.user_id, name: m.name || m.email })}
                                className="text-xs text-[#F0506E] hover:text-[#F0506E]/80 font-medium"
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

          {/* Pending Invitations */}
          {(invites || []).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--panel)]">
              <div className="border-b border-[var(--border-strong)] px-6 py-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Pending Invitations</h2>
                <span className="text-xs text-[var(--text-2)]">{invites.length} pending</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[var(--border-strong)] bg-[var(--bg)]/50 text-[var(--text-2)]">
                    <tr>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Role</th>
                      <th className="px-6 py-3 font-medium">Sent</th>
                      <th className="px-6 py-3 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-strong)]">
                    {invites.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[var(--border)]/30">
                        <td className="px-6 py-4 font-medium text-white">{inv.email}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[var(--input)] text-xs font-medium text-[var(--text-2)] border border-[var(--border)]">
                            {inv.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-[var(--text-2)]">
                          {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : "Pending"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <span className="text-xs text-[#F59E0B] font-medium">Invited</span>
                            {canResend && (
                              <button
                                onClick={() => handleResendInvite(inv.id)}
                                disabled={resendingInviteId === inv.id}
                                className="text-xs text-[#3B67E0] hover:underline font-medium disabled:opacity-50"
                              >
                                {resendingInviteId === inv.id ? "Resending..." : "Resend invite"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ROLES & PERMISSIONS */}
      {activeTab === "roles" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(roles || []).map((role) => (
              <div
                key={role.id}
                className="bg-[var(--panel)] border border-[var(--border-strong)] rounded-xl p-5 space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: role.color || "#4876F3" }}
                      />
                      <h3 className="text-sm font-semibold text-white">{role.name}</h3>
                      {role.is_system && (
                        <span className="px-2 py-0.5 bg-[var(--border)] text-xs font-medium text-[var(--text-2)] rounded-md">
                          System
                        </span>
                      )}
                    </div>

                    {!role.is_system && (
                      <button
                        onClick={() => setRoleToDelete({ id: role.id, name: role.name })}
                        className="p-1 rounded hover:bg-[#F0506E]/10 text-[var(--text-2)] hover:text-[#F0506E]"
                        title="Delete Role"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-[var(--text-2)] mt-1">
                    {role.member_count} {role.member_count === 1 ? "member assigned" : "members assigned"}
                  </p>

                  {/* Permissions count or list */}
                  <div className="mt-4 pt-3 border-t border-[var(--border-strong)]/50">
                    <p className="text-xs font-medium text-[var(--text-2)]  mb-2">
                      Permissions ({role.permissions?.length || 0})
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {role.permissions && role.permissions.length > 0 ? (
                        role.permissions.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 bg-[var(--bg)] border border-[var(--border-strong)]/40 text-xs text-zinc-300 rounded"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-[var(--text-2)]">No elevated permissions</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Custom Role Modal */}
      {roleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleCreateRole}
            className="w-full max-w-2xl bg-[var(--panel)] border border-[var(--border)] rounded-xl shadow-overlay flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
              <div>
                <h3 className="text-base font-semibold text-white">New Role</h3>
                <p className="text-xs text-[var(--text-2)] mt-0.5">
                  Define a tailored permission profile for team members
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--input)] text-[var(--text-3)] hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {roleError && (
                <div className="p-3 bg-[#F0506E]/10 border border-[#F0506E]/20 text-[#F0506E] text-xs rounded-xl">
                  {roleError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-white block mb-1.5">
                    Role Name
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    required
                    placeholder="e.g. Lead Colorist"
                    className="w-full h-10 bg-[var(--input)] border border-[var(--border)] rounded-[10px] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-white block mb-1.5">
                    Badge Color
                  </label>
                  <div className="flex items-center gap-2">
                    {["#4876F3", "#10B981", "#8B5CF6", "#F59E0B", "#F0506E"].map((c) => (
                      <button
                        type="button"
                        key={c}
                        onClick={() => setRoleColor(c)}
                        className={`w-7 h-7 rounded-full transition-transform ${
                          roleColor === c ? "scale-[1.015] ring-2 ring-white" : "opacity-70 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* 17 Permissions Matrix */}
              <div className="space-y-4 pt-2 border-t border-[var(--panel)]">
                <h4 className="text-xs font-bold  text-[var(--text-2)]">
                  Permissions ({selectedPerms.length} selected)
                </h4>

                <div className="space-y-5">
                  {PERMISSION_GROUPS.map((grp) => (
                    <div key={grp.category} className="space-y-2">
                      <p className="text-xs font-semibold text-white">{grp.category}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {grp.perms.map((p) => {
                          const isChecked = selectedPerms.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                isChecked
                                  ? "bg-[#4876F3]/10 border-[#4876F3] text-white"
                                  : "bg-[var(--bg)] border-[var(--panel)] text-[var(--text-2)] hover:text-white"
                              }`}
                            >
                              <span>{p.label}</span>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePerm(p.id)}
                                className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0 ml-2"
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[var(--panel)] flex items-center justify-end gap-2 bg-[var(--bg)]">
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="px-4 py-2 bg-transparent hover:bg-[var(--panel)] text-xs text-[var(--text-2)] hover:text-white rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={roleLoading || !roleName}
                className="px-5 py-2 bg-[#4876F3] hover:bg-[#3560D6] disabled:opacity-50 text-white text-xs font-semibold rounded-[10px] shadow transition-colors"
              >
                {roleLoading ? "Creating..." : "Create Role"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleSendInvite}
            className="w-full max-w-md bg-[var(--panel)] border border-[var(--border)] rounded-xl p-6 shadow-overlay space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <h3 className="text-base font-semibold text-white">Invite Team Member</h3>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--input)] text-[var(--text-3)] hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {inviteError && (
              <p className="text-xs text-[#F0506E] bg-[#F0506E]/10 p-2.5 rounded-xl border border-[#F0506E]/20">
                {inviteError}
              </p>
            )}

            <div>
              <label className="text-xs font-medium text-white block mb-1">Email Address</label>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@agency.com"
                className="w-full h-10 bg-[var(--input)] border border-[var(--border)] rounded-[10px] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white block mb-1">Role</label>
              <div className="relative">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full h-10 bg-[var(--input)] border border-[var(--border)] rounded-[10px] px-3.5 pr-9 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors"
                >
                  {canChangeRoles && (
                    <>
                      <option value="CEO">CEO</option>
                      <option value="COO">COO</option>
                      <option value="CFO">CFO</option>
                      <option value="Chief Sales Officer">Chief Sales Officer</option>
                      <option value="Design Head">Design Head</option>
                    </>
                  )}
                  <option value="Project Manager">Project Manager</option>
                  <option value="Editor">Editor</option>
                  {roles
                    .filter((r) => !r.is_system && !["ceo", "coo", "cfo", "chief sales officer", "design head", "project manager", "editor"].includes(r.name.toLowerCase()))
                    .map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                </select>
                <ChevronDown className="w-[14px] h-[14px] text-[var(--text-3)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-[var(--text-2)] hover:text-white rounded-[10px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={inviteLoading || !inviteEmail}
                className="px-4 py-2 bg-[#4876F3] hover:bg-[#3560D6] disabled:opacity-50 text-white text-xs font-semibold rounded-[10px] shadow transition-colors"
              >
                {inviteLoading ? "Sending..." : "Send Invitation"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Remove Member Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
        title={`Remove ${memberToRemove?.name || "member"}?`}
        description="Are you sure you want to remove this member from the workspace? They will lose access to all projects and documents."
        confirmLabel="Remove Member"
        variant="danger"
        onConfirm={() => memberToRemove && executeRemoveMember(memberToRemove.id)}
      />

      {/* Delete Role Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(roleToDelete)}
        onOpenChange={(open) => !open && setRoleToDelete(null)}
        title={`Delete role "${roleToDelete?.name || ""}"?`}
        description="Are you sure you want to delete this custom role? Members with this role will revert to the default Editor role."
        confirmLabel="Delete Role"
        variant="danger"
        onConfirm={() => roleToDelete && executeDeleteRole(roleToDelete.id)}
      />
    </div>
  );
}
