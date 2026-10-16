"use client";

import React, { useState, useEffect } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Shield, Plus, Trash2, Check, AlertCircle, X, Users, ChevronDown } from "lucide-react";

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
  const [inviteRole, setInviteRole] = useState<string>("editor");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // New/Edit Role modal
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [roleColor, setRoleColor] = useState("#4876F3");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

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

      const [membersData, invitesData, rolesData] = await Promise.all([
        apiRequest(`/companies/${activeComp.id}/members`),
        apiRequest(`/companies/${activeComp.id}/invites`).catch(() => []),
        apiRequest("/roles").catch(() => []),
      ]);

      setMembers(membersData);
      setInvites(invitesData);
      setRoles(rolesData);
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
      alert(apiErr.message || apiErr.error || "Failed to remove member.");
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
      alert(apiErr.message || apiErr.error || "Failed to update member role.");
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
      loadTeamData();
    } catch (err: any) {
      setRoleError(err.message || "Failed to create role");
    } finally {
      setRoleLoading(false);
    }
  }

  async function handleDeleteRole(roleId: string, roleName: string) {
    if (!confirm(`Are you sure you want to delete role "${roleName}"?`)) return;

    try {
      await apiRequest(`/roles/${roleId}`, { method: "DELETE" });
      loadTeamData();
    } catch (err: any) {
      alert(err.message || "Failed to delete role");
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
            <span className="rounded-full bg-[#2E2F34] px-2.5 py-0.5 text-xs font-semibold text-[#A3A6AD]">
              {totalSeatsUsed} of {maxTrialSeats} seats
            </span>
          </div>
          <p className="mt-1 text-xs text-[#A3A6AD]">
            Manage members, invitations, and custom access roles in <span className="text-white font-medium">{companyName || "Workspace"}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === "roles" ? (
            <button
              onClick={() => setRoleModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3B67E0] transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Role
            </button>
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
      <div className="flex border-b border-[#424344]/60">
        <button
          onClick={() => setActiveTab("members")}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "members"
              ? "border-[#4876F3] text-white"
              : "border-transparent text-[#A3A6AD] hover:text-white"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Members ({members.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "roles"
              ? "border-[#4876F3] text-white"
              : "border-transparent text-[#A3A6AD] hover:text-white"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Roles & Permissions ({roles.length})</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* TAB 1: MEMBERS */}
      {activeTab === "members" && (
        <div className="overflow-hidden rounded-xl border border-[#424344] bg-[#212121]">
          <div className="border-b border-[#424344] px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Active Members</h2>
            <span className="text-xs text-[#A3A6AD]">{members.length} people</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-[#A3A6AD]">Loading members...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#424344] bg-[#181818]/50 text-[#A3A6AD]">
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
                    return (
                      <tr key={m.user_id} className="hover:bg-[#2E2F34]/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-[#4876F3]/20 text-[#4876F3] flex items-center justify-center font-bold text-xs ">
                              {m.name ? m.name.charAt(0) : m.email.charAt(0)}
                            </div>
                            <div>
                              <div className="font-semibold text-white">
                                {m.name || "Anonymous"} {isSelf && "(You)"}
                              </div>
                              <div className="text-[11px] text-[#A3A6AD]">{m.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={m.role}
                            disabled={isSelf}
                            onChange={(e) => handleUpdateRole(m.user_id, e.target.value)}
                            className="bg-[#181818] border border-[#424344] rounded-lg px-2.5 py-1 text-xs text-white disabled:opacity-50"
                          >
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="editor">Editor</option>
                            {roles
                              .filter((r) => !r.is_system && r.name.toLowerCase() !== "manager" && r.name.toLowerCase() !== "editor")
                              .map((r) => (
                                <option key={r.id} value={r.name}>
                                  {r.name}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 text-[#A3A6AD]">
                          {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "Active"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {!isSelf && (
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="text-xs text-red-400 hover:text-red-300 font-medium"
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
      )}

      {/* TAB 2: ROLES & PERMISSIONS */}
      {activeTab === "roles" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <div
                key={role.id}
                className="bg-[#212121] border border-[#424344] rounded-xl p-5 space-y-4 flex flex-col justify-between"
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
                        <span className="px-2 py-0.5 bg-[#2E2F34] text-xs font-medium text-[#A3A6AD] rounded-md">
                          System
                        </span>
                      )}
                    </div>

                    {!role.is_system && (
                      <button
                        onClick={() => handleDeleteRole(role.id, role.name)}
                        className="p-1 rounded hover:bg-rose-500/10 text-[#A3A6AD] hover:text-rose-400"
                        title="Delete Role"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-[#A3A6AD] mt-1">
                    {role.member_count} {role.member_count === 1 ? "member assigned" : "members assigned"}
                  </p>

                  {/* Permissions count or list */}
                  <div className="mt-4 pt-3 border-t border-[#424344]/50">
                    <p className="text-[11px] font-medium text-[#A3A6AD]  mb-2">
                      Permissions ({role.permissions?.length || 0})
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
                      {role.permissions && role.permissions.length > 0 ? (
                        role.permissions.map((p) => (
                          <span
                            key={p}
                            className="px-2 py-0.5 bg-[#181818] border border-[#424344]/40 text-xs text-zinc-300 rounded"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-[#A3A6AD]">No elevated permissions</span>
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
            className="w-full max-w-2xl bg-[#212121] border border-[#2E2F34] rounded-xl shadow-overlay flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between p-5 border-b border-[#2E2F34]">
              <div>
                <h3 className="text-base font-semibold text-white">New Role</h3>
                <p className="text-xs text-[#A3A6AD] mt-0.5">
                  Define a tailored permission profile for team members
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#2A2B30] text-[#7C7F87] hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {roleError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-[10px]">
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
                    className="w-full h-10 bg-[#2A2B30] border border-[#2E2F34] rounded-[10px] px-3.5 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] transition-colors"
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
                          roleColor === c ? "scale-125 ring-2 ring-white" : "opacity-70 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* 17 Permissions Matrix */}
              <div className="space-y-4 pt-2 border-t border-[#212121]">
                <h4 className="text-xs font-bold  text-[#A3A6AD]">
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
                                  : "bg-[#181818] border-[#212121] text-[#A3A6AD] hover:text-white"
                              }`}
                            >
                              <span>{p.label}</span>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePerm(p.id)}
                                className="rounded border-[#212121] text-[#4876F3] focus:ring-0 ml-2"
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

            <div className="p-4 border-t border-[#212121] flex items-center justify-end gap-2 bg-[#181818]">
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                className="px-4 py-2 bg-transparent hover:bg-[#212121] text-xs text-[#A3A6AD] hover:text-white rounded-xl"
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
            className="w-full max-w-md bg-[#212121] border border-[#2E2F34] rounded-xl p-6 shadow-overlay space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#2E2F34]">
              <h3 className="text-base font-semibold text-white">Invite Team Member</h3>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[#2A2B30] text-[#7C7F87] hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {inviteError && (
              <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-[10px] border border-red-500/20">
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
                className="w-full h-10 bg-[#2A2B30] border border-[#2E2F34] rounded-[10px] px-3.5 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3] transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-white block mb-1">Role</label>
              <div className="relative">
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full h-10 bg-[#2A2B30] border border-[#2E2F34] rounded-[10px] px-3.5 pr-9 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none transition-colors"
                >
                  <option value="editor">Editor</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                  {roles
                    .filter((r) => !r.is_system && r.name.toLowerCase() !== "manager" && r.name.toLowerCase() !== "editor")
                    .map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                </select>
                <ChevronDown className="w-[14px] h-[14px] text-[#7C7F87] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#2E2F34]">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-[#A3A6AD] hover:text-white rounded-[10px]"
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
    </div>
  );
}
