"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/use-auth";
import { apiRequest, ApiError } from "@/lib/api";
import {
  Shield,
  Users,
  Building2,
  Plus,
  Trash2,
  Check,
  X,
  Search,
  Mail,
  History,
  RotateCw,
  AlertCircle,
  Lock,
  UserCheck,
  User,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "@/components/ui/icon";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";

export interface Member {
  id: string;
  user_id: string;
  name: string;
  username: string;
  email: string;
  avatar_url: string;
  role: string;
  title: string;
  status: "active" | "invited" | "deactivated" | string;
  permissions: Record<string, boolean>;
  created_at: string;
}

export interface AuditItem {
  id: string;
  actor_name: string;
  action: string;
  details: Record<string, any>;
  created_at: string;
}

export interface ClientContactItem {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  default_level: string;
  can_download: boolean;
  last_signed_in_at: string | null;
  created_at: string;
}

export interface ClientWithPeople {
  id: string;
  name: string;
  website: string;
  logo_key: string;
  status: string;
  contacts: ClientContactItem[];
  created_at: string;
}

const SWITCH_DESCRIPTIONS: { key: string; label: string; desc: string; adminOnly?: boolean }[] = [
  {
    key: "admin",
    label: "Admin switch",
    desc: "Full workspace controls, team management, and billing settings.",
    adminOnly: true,
  },
  {
    key: "manage_access",
    label: "Manage access",
    desc: "Add, edit, or remove members on projects and items.",
  },
  {
    key: "create_project",
    label: "Create project",
    desc: "Create new projects for the company.",
  },
  {
    key: "rename_project",
    label: "Rename project",
    desc: "Change the title and properties of projects.",
  },
  {
    key: "delete_project",
    label: "Delete project",
    desc: "Archive or delete projects.",
  },
  {
    key: "move_items",
    label: "Move items",
    desc: "Move files and folders between projects and folders.",
  },
  {
    key: "copy_items",
    label: "Copy items",
    desc: "Duplicate and copy files and folders.",
  },
  {
    key: "delete_items",
    label: "Delete items",
    desc: "Send items to trash and empty workspace trash.",
  },
  {
    key: "create_task",
    label: "Create task",
    desc: "Create new tasks on project trackers.",
  },
  {
    key: "delete_task",
    label: "Delete task",
    desc: "Delete tasks from project trackers.",
  },
  {
    key: "change_task_status",
    label: "Change task status",
    desc: "Update task progress and column statuses.",
  },
  {
    key: "invite_people",
    label: "Invite people",
    desc: "Invite new staff or editors to the company.",
  },
];

const STAFF_DEFAULTS: Record<string, boolean> = {
  admin: false,
  manage_access: true,
  create_project: true,
  rename_project: true,
  delete_project: true,
  move_items: true,
  copy_items: true,
  delete_items: true,
  create_task: true,
  delete_task: true,
  change_task_status: true,
  invite_people: false,
};

const EDITOR_DEFAULTS: Record<string, boolean> = {
  admin: false,
  manage_access: false,
  create_project: false,
  rename_project: false,
  delete_project: false,
  move_items: false,
  copy_items: false,
  delete_items: false,
  create_task: false,
  delete_task: false,
  change_task_status: false,
  invite_people: false,
};

export default function AdminPage() {
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"staff" | "editors" | "clients">("staff");

  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<ClientWithPeople[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Edit drawer state
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editRole, setEditRole] = useState("Staff");
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [memberHistory, setMemberHistory] = useState<AuditItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Modals state
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberRole, setAddMemberRole] = useState<"Staff" | "Editor">("Staff");
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberTitle, setNewMemberTitle] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);

  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [targetClientForContact, setTargetClientForContact] = useState<ClientWithPeople | null>(null);
  const [newContactName, setNewContactName] = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [isAddingContact, setIsAddingContact] = useState(false);

  // Confirm dialogs
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [confirmRemoveContactOpen, setConfirmRemoveContactOpen] = useState(false);
  const [contactToRemove, setContactToRemove] = useState<{ clientId: string; contactId: string; name: string } | null>(null);

  const activeAdminsCount = useMemo(() => {
    return members.filter((m) => m.permissions?.admin === true && m.status !== "deactivated").length;
  }, [members]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === "clients") {
        const res = await apiRequest<{ clients: ClientWithPeople[] }>("/admin/clients");
        setClients(res.clients || []);
      } else {
        const res = await apiRequest<{ members: Member[] }>(`/admin/members?tab=${activeTab}`);
        setMembers(res.members || []);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load admin data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const openEditDrawer = async (m: Member) => {
    setSelectedMember(m);
    setEditTitle(m.title || "");
    const formattedRole = m.role?.toLowerCase() === "editor" ? "Editor" : "Staff";
    setEditRole(formattedRole);
    setEditPerms({ ...(m.permissions || (formattedRole === "Staff" ? STAFF_DEFAULTS : EDITOR_DEFAULTS)) });

    setIsLoadingHistory(true);
    try {
      const res = await apiRequest<{ history: AuditItem[] }>(`/admin/members/${m.id}/history`);
      setMemberHistory(res.history || []);
    } catch {
      setMemberHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const closeEditDrawer = () => {
    setSelectedMember(null);
    setMemberHistory([]);
  };

  const handleRoleChange = (newR: "Staff" | "Editor") => {
    setEditRole(newR);
    if (newR === "Staff") {
      setEditPerms({ ...STAFF_DEFAULTS, admin: editPerms.admin || false });
    } else {
      setEditPerms({ ...EDITOR_DEFAULTS, admin: false });
    }
  };

  const togglePermissionSwitch = (key: string) => {
    if (!selectedMember) return;

    // Safety: Nobody can remove their own admin switch
    if (key === "admin" && selectedMember.user_id === user?.id) {
      toast.error("You cannot remove your own admin switch.");
      return;
    }

    // Safety: Only admins can toggle admin switch
    if (key === "admin" && !isAdmin) {
      toast.error("Only administrators can change the admin switch.");
      return;
    }

    // Safety: Last active admin protection
    if (key === "admin" && editPerms.admin && activeAdminsCount <= 1) {
      toast.error("The last active admin cannot lose admin rights.");
      return;
    }

    setEditPerms((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSaveMember = async () => {
    if (!selectedMember) return;
    setIsSavingMember(true);
    try {
      await apiRequest(`/admin/members/${selectedMember.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle,
          role: editRole,
          permissions: editPerms,
        }),
      });
      toast.success("Member updated successfully");
      closeEditDrawer();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update member");
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleDeactivateMember = async () => {
    if (!selectedMember) return;
    try {
      await apiRequest(`/admin/members/${selectedMember.id}/deactivate`, {
        method: "POST",
      });
      toast.success("Member deactivated successfully");
      setConfirmDeactivateOpen(false);
      closeEditDrawer();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to deactivate member");
    }
  };

  const handleReactivateMember = async () => {
    if (!selectedMember) return;
    try {
      await apiRequest(`/admin/members/${selectedMember.id}/reactivate`, {
        method: "POST",
      });
      toast.success("Member reactivated successfully");
      closeEditDrawer();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to reactivate member");
    }
  };

  const handleResendMemberInvite = async (m: Member) => {
    try {
      await apiRequest(`/admin/members/${m.id}/resend`, {
        method: "POST",
      });
      toast.success(`Invite resent to ${m.email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend invite");
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    setIsAddingMember(true);
    try {
      await apiRequest("/admin/members", {
        method: "POST",
        body: JSON.stringify({
          name: newMemberName.trim(),
          email: newMemberEmail.trim(),
          role: addMemberRole,
          title: newMemberTitle.trim(),
        }),
      });
      toast.success(`${addMemberRole} invited successfully`);
      setShowAddMemberModal(false);
      setNewMemberName("");
      setNewMemberEmail("");
      setNewMemberTitle("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add member");
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleAddContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClientForContact || !newContactEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    setIsAddingContact(true);
    try {
      await apiRequest(`/admin/clients/${targetClientForContact.id}/contacts`, {
        method: "POST",
        body: JSON.stringify({
          name: newContactName.trim(),
          email: newContactEmail.trim(),
        }),
      });
      toast.success("Client contact invited successfully");
      setShowAddContactModal(false);
      setTargetClientForContact(null);
      setNewContactName("");
      setNewContactEmail("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to add contact");
    } finally {
      setIsAddingContact(false);
    }
  };

  const handleResendContactInvite = async (clientId: string, contactId: string, email: string) => {
    try {
      await apiRequest(`/admin/clients/${clientId}/contacts/${contactId}/resend`, {
        method: "POST",
      });
      toast.success(`Invite resent to ${email}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend contact invite");
    }
  };

  const handleConfirmRemoveContact = async () => {
    if (!contactToRemove) return;
    try {
      await apiRequest(`/admin/clients/${contactToRemove.clientId}/contacts/${contactToRemove.contactId}`, {
        method: "DELETE",
      });
      toast.success("Client contact removed and account deactivated");
      setConfirmRemoveContactOpen(false);
      setContactToRemove(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to remove client contact");
    }
  };

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        m.username?.toLowerCase().includes(q) ||
        m.title?.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase();
    return clients.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.website?.toLowerCase().includes(q) ||
        c.contacts?.some((ct) => ct.name.toLowerCase().includes(q) || ct.email.toLowerCase().includes(q))
    );
  }, [clients, searchQuery]);

  if (isAuthLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--bg)] text-[var(--text-3)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg)] text-[var(--text)] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-[var(--border)] px-8 pt-8 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">Admin</h1>
            <p className="mt-1 text-sm text-[var(--text-2)]">
              Manage your company staff, freelance editors, and client contacts.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {activeTab !== "clients" ? (
              <button
                onClick={() => {
                  setAddMemberRole(activeTab === "staff" ? "Staff" : "Editor");
                  setShowAddMemberModal(true);
                }}
                className="flex items-center gap-2 rounded-md bg-[var(--button)] px-4 py-2 text-sm font-medium text-[var(--button-text)] hover:bg-[var(--button-hover)] transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" />
                <span>Add {activeTab === "staff" ? "Staff" : "Editor"}</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Tab Controls & Search */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex items-center space-x-1 border-b border-[var(--border)] -mb-px">
            <button
              onClick={() => setActiveTab("staff")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "staff"
                  ? "border-[var(--accent)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--border-strong)]"
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Staff</span>
            </button>

            <button
              onClick={() => setActiveTab("editors")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "editors"
                  ? "border-[var(--accent)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--border-strong)]"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              <span>Editors</span>
            </button>

            <button
              onClick={() => setActiveTab("clients")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "clients"
                  ? "border-[var(--accent)] text-[var(--text)]"
                  : "border-transparent text-[var(--text-2)] hover:text-[var(--text)] hover:border-[var(--border-strong)]"
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Clients</span>
            </button>
          </div>

          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-3)]" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] pl-9 pr-3 py-1.5 text-sm text-[var(--text)] placeholder-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="flex h-64 w-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-3)]" />
          </div>
        ) : activeTab === "clients" ? (
          /* Clients View */
          filteredClients.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
              <Building2 className="h-10 w-10 text-[var(--text-3)] mb-3" />
              <h3 className="text-base font-medium text-[var(--text)]">No clients found</h3>
              <p className="mt-1 text-sm text-[var(--text-2)] max-w-sm">
                Add clients in the Clients directory to manage contacts and assigned projects.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--panel)] overflow-hidden shadow-sm"
                >
                  <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-raised)] px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--input)] text-base font-semibold text-[var(--text)] border border-[var(--border)]">
                        {client.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[var(--text)]">{client.name}</h3>
                        {client.website ? (
                          <span className="text-xs text-[var(--text-3)]">{client.website}</span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setTargetClientForContact(client);
                        setShowAddContactModal(true);
                      }}
                      className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add contact</span>
                    </button>
                  </div>

                  {client.contacts && client.contacts.length > 0 ? (
                    <div className="divide-y divide-[var(--border)]">
                      {client.contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="flex items-center justify-between px-6 py-3.5 hover:bg-[var(--hover)] transition-colors text-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--panel-raised)] border border-[var(--border)] text-xs font-medium text-[var(--text)]">
                              {contact.name?.substring(0, 2).toUpperCase() || "CT"}
                            </div>
                            <div>
                              <div className="font-medium text-[var(--text)]">{contact.name}</div>
                              <div className="text-xs text-[var(--text-3)]">{contact.email}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className="text-xs text-[var(--text-3)]">
                              Level: <span className="text-[var(--text-2)]">{contact.default_level || "per project"}</span>
                            </span>

                            <button
                              onClick={() => handleResendContactInvite(client.id, contact.id, contact.email)}
                              className="rounded px-2.5 py-1 text-xs text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--panel-raised)] transition-colors"
                              title="Resend welcome invite"
                            >
                              Resend invite
                            </button>

                            <button
                              onClick={() => {
                                setContactToRemove({
                                  clientId: client.id,
                                  contactId: contact.id,
                                  name: contact.name,
                                });
                                setConfirmRemoveContactOpen(true);
                              }}
                              className="rounded p-1 text-[var(--text-3)] hover:text-[#F0506E] hover:bg-[#F0506E]/10 transition-colors"
                              title="Remove client person"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-6 py-6 text-center text-xs text-[var(--text-3)]">
                      No contacts added for this client yet.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          /* Staff & Editors View */
          filteredMembers.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
              <Users className="h-10 w-10 text-[var(--text-3)] mb-3" />
              <h3 className="text-base font-medium text-[var(--text)]">No {activeTab} found</h3>
              <p className="mt-1 text-sm text-[var(--text-2)] max-w-sm">
                Get started by clicking &quot;Add {activeTab === "staff" ? "Staff" : "Editor"}&quot; above.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--panel)] overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--panel-raised)] text-xs font-semibold text-[var(--text-3)]">
                    <th className="px-6 py-3">Person</th>
                    <th className="px-6 py-3">Email</th>
                    {activeTab === "staff" && <th className="px-6 py-3">Title</th>}
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredMembers.map((m) => {
                    const isSelf = m.user_id === user?.id;
                    const hasAdmin = m.permissions?.admin === true;
                    return (
                      <tr
                        key={m.id}
                        onClick={() => openEditDrawer(m)}
                        className="cursor-pointer hover:bg-[var(--hover)] transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar
                              src={m.avatar_url}
                              name={m.name || m.email}
                              className="h-8 w-8 border border-[var(--border)]"
                            />
                            <div>
                              <div className="flex items-center gap-1.5 font-medium text-[var(--text)]">
                                <span>{m.name || "Unnamed"}</span>
                                {hasAdmin && (
                                  <span className="flex items-center gap-1 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-xs font-semibold text-[var(--accent)]">
                                    <Shield className="h-2.5 w-2.5" />
                                    <span>Admin</span>
                                  </span>
                                )}
                                {isSelf && (
                                  <span className="rounded bg-[var(--panel-raised)] border border-[var(--border)] px-1.5 py-0.5 text-xs text-[var(--text-3)]">
                                    You
                                  </span>
                                )}
                              </div>
                              {m.username && (
                                <div className="text-xs text-[var(--text-3)]">@{m.username}</div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-xs text-[var(--text-2)]">{m.email}</td>

                        {activeTab === "staff" && (
                          <td className="px-6 py-4">
                            {m.title ? (
                              <span className="rounded-md border border-[var(--border)] bg-[var(--panel-raised)] px-2 py-1 text-xs text-[var(--text-2)] font-mono">
                                {m.title}
                              </span>
                            ) : (
                              <span className="text-xs text-[var(--text-3)] italic">—</span>
                            )}
                          </td>
                        )}

                        <td className="px-6 py-4">
                          <span className="text-xs text-[var(--text-2)] capitalize font-medium">
                            {m.role || "Staff"}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                              m.status === "active"
                                ? "bg-[#3FCF8E]/10 text-[#3FCF8E] border-[#3FCF8E]/30"
                                : m.status === "deactivated"
                                ? "bg-[#F0506E]/10 text-[#F0506E] border-[#F0506E]/30"
                                : "bg-[#FFD43B]/10 text-[#FFD43B] border-[#FFD43B]/30"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                m.status === "active"
                                  ? "bg-[#3FCF8E]"
                                  : m.status === "deactivated"
                                  ? "bg-[#F0506E]"
                                  : "bg-[#FFD43B]"
                              }`}
                            />
                            <span className="capitalize">{m.status || "active"}</span>
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {m.status === "invited" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResendMemberInvite(m);
                                }}
                                className="rounded px-2.5 py-1 text-xs text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--panel-raised)] transition-colors"
                              >
                                Resend invite
                              </button>
                            )}
                            <ChevronRight className="h-4 w-4 text-[var(--text-3)] group-hover:text-[var(--text)] transition-colors" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Edit Member Drawer / Slide-Over */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/80 animate-in fade-in duration-200">
          <div
            className="flex h-full w-full max-w-xl flex-col bg-[var(--panel)] border-l border-[var(--border)] shadow-lg animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-5 bg-[var(--panel-raised)]">
              <div className="flex items-center gap-3">
                <Avatar
                  src={selectedMember.avatar_url}
                  name={selectedMember.name || selectedMember.email}
                  className="h-10 w-10 border border-[var(--border)]"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--text)]">
                      {selectedMember.name || "Edit person"}
                    </h2>
                    {selectedMember.user_id === user?.id && (
                      <span className="rounded bg-[var(--input)] px-1.5 py-0.5 text-xs text-[var(--text-3)] border border-[var(--border)]">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-3)]">{selectedMember.email}</div>
                </div>
              </div>

              <button
                onClick={closeEditDrawer}
                className="rounded p-1 text-[var(--text-3)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* Role & Title Controls */}
              <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[var(--text-3)]">Role</label>
                  <div className="flex items-center rounded-md bg-[var(--input)] border border-[var(--border)] p-0.5">
                    <button
                      type="button"
                      onClick={() => handleRoleChange("Staff")}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        editRole === "Staff"
                          ? "bg-[var(--accent)] text-white shadow-sm"
                          : "text-[var(--text-2)] hover:text-[var(--text)]"
                      }`}
                    >
                      Staff
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRoleChange("Editor")}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        editRole === "Editor"
                          ? "bg-[var(--accent)] text-white shadow-sm"
                          : "text-[var(--text-2)] hover:text-[var(--text)]"
                      }`}
                    >
                      Editor
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-3)] mb-1.5">
                    Title / Custom Tag
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="e.g. CEO, COO, Senior Colourist, Producer"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-1.5 text-sm text-[var(--text)] placeholder-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-[var(--text-3)]">
                    Shown as a badge on the team directory and review exports.
                  </p>
                </div>
              </div>

              {/* 12 Permission Switches */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[var(--text-3)] tracking-wider">
                    Permissions &amp; Switches (12)
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (editRole === "Staff") {
                        setEditPerms({ ...STAFF_DEFAULTS, admin: editPerms.admin || false });
                      } else {
                        setEditPerms({ ...EDITOR_DEFAULTS, admin: false });
                      }
                      toast.info(`Reset to ${editRole} defaults`);
                    }}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    Reset to {editRole} defaults
                  </button>
                </div>

                <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--panel-raised)]">
                  {SWITCH_DESCRIPTIONS.map((sw) => {
                    const isChecked = !!editPerms[sw.key];
                    const isSelfAdmin = sw.key === "admin" && selectedMember.user_id === user?.id;
                    const isLastAdmin = sw.key === "admin" && isChecked && activeAdminsCount <= 1;
                    const isDisabled = isSelfAdmin || isLastAdmin || (sw.key === "admin" && !isAdmin);

                    return (
                      <div
                        key={sw.key}
                        className="flex items-start justify-between p-3.5 hover:bg-[var(--hover)] transition-colors gap-3"
                      >
                        <div className="flex-1 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-[var(--text)]">{sw.label}</span>
                            {sw.adminOnly && (
                              <span className="rounded bg-[var(--accent)]/15 px-1 py-0.5 text-xs font-semibold text-[var(--accent)]">
                                Admin only
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-3)] mt-0.5">{sw.desc}</p>
                          {isSelfAdmin && (
                            <p className="text-xs text-[var(--text-3)] mt-0.5 italic">
                              Cannot remove your own admin switch
                            </p>
                          )}
                          {isLastAdmin && (
                            <p className="text-xs text-[var(--text-3)] mt-0.5 italic">
                              Last active admin cannot lose admin
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          disabled={isDisabled}
                          onClick={() => togglePermissionSwitch(sw.key)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            isDisabled ? "opacity-40 cursor-not-allowed" : ""
                          } ${isChecked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                              isChecked ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Account State & Status Actions */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] p-4 space-y-3">
                <h3 className="text-xs font-semibold text-[var(--text-3)] tracking-wider">
                  Account Status
                </h3>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-[var(--text)]">
                      Current: <span className="capitalize">{selectedMember.status}</span>
                    </div>
                    <p className="text-xs text-[var(--text-3)]">
                      {selectedMember.status === "deactivated"
                        ? "Deactivated person cannot sign in. Their uploads and comments stay."
                        : "Active member can access authorized projects and tools."}
                    </p>
                  </div>

                  {selectedMember.status === "deactivated" ? (
                    <button
                      type="button"
                      onClick={handleReactivateMember}
                      className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[#3FCF8E] hover:bg-[#3FCF8E]/10 transition-colors"
                    >
                      Reactivate person
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={selectedMember.user_id === user?.id || (editPerms.admin && activeAdminsCount <= 1)}
                      onClick={() => setConfirmDeactivateOpen(true)}
                      className={`rounded-md border border-[#F0506E]/30 bg-[#F0506E]/10 px-3 py-1.5 text-xs font-medium text-[#F0506E] hover:bg-[#F0506E]/20 transition-colors ${
                        selectedMember.user_id === user?.id || (editPerms.admin && activeAdminsCount <= 1)
                          ? "opacity-40 cursor-not-allowed"
                          : ""
                      }`}
                    >
                      Deactivate person
                    </button>
                  )}
                </div>
              </div>

              {/* History Audit Log */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <History className="h-4 w-4 text-[var(--text-3)]" />
                  <h3 className="text-xs font-semibold text-[var(--text-3)] tracking-wider">
                    Admin Action History
                  </h3>
                </div>

                <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-raised)] p-4">
                  {isLoadingHistory ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-[var(--text-3)]" />
                    </div>
                  ) : memberHistory.length === 0 ? (
                    <div className="text-center py-3 text-xs text-[var(--text-3)]">
                      No admin actions recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {memberHistory.map((item) => (
                        <div key={item.id} className="flex flex-col text-xs space-y-0.5">
                          <div className="flex items-center justify-between text-[var(--text-2)]">
                            <span className="font-medium text-[var(--text)]">
                              {item.actor_name || "Admin"}
                            </span>
                            <span className="text-xs text-[var(--text-3)] font-mono">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[var(--text-2)]">
                            Action: <span className="font-mono text-[var(--accent)]">{item.action}</span>
                          </div>
                          {item.details && Object.keys(item.details).length > 0 && (
                            <div className="text-xs text-[var(--text-3)] font-mono bg-[var(--input)] p-1.5 rounded border border-[var(--border)] overflow-x-auto">
                              {JSON.stringify(item.details)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4 bg-[var(--panel-raised)]">
              <button
                type="button"
                onClick={closeEditDrawer}
                className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSaveMember}
                disabled={isSavingMember}
                className="flex items-center gap-2 rounded-md bg-[var(--button)] px-5 py-2 text-sm font-medium text-[var(--button-text)] hover:bg-[var(--button-hover)] transition-colors shadow-sm disabled:opacity-50"
              >
                {isSavingMember && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Save changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-150">
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg overflow-hidden animate-in fade-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-raised)] px-6 py-4">
              <h2 className="text-base font-semibold text-[var(--text)]">Add {addMemberRole}</h2>
              <button
                onClick={() => setShowAddMemberModal(false)}
                className="rounded p-1 text-[var(--text-3)] hover:text-[var(--text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddMemberSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-3)] mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-3)] mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="john@company.com"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              {addMemberRole === "Staff" && (
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-3)] mb-1.5">
                    Title / Custom Tag (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Colourist, Head of Sound"
                    value={newMemberTitle}
                    onChange={(e) => setNewMemberTitle(e.target.value)}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              )}

              <div className="rounded-md border border-[var(--border)] bg-[var(--panel-raised)] p-3 text-xs text-[var(--text-2)]">
                {addMemberRole === "Staff"
                  ? "Staff members can see all clients and projects, and start with full project permissions."
                  : "Editors are per-project and only see projects they have been specifically added to."}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="rounded-md border border-[var(--border)] bg-[var(--panel-raised)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingMember}
                  className="flex items-center gap-2 rounded-md bg-[var(--button)] px-4 py-2 text-sm font-medium text-[var(--button-text)] hover:bg-[var(--button-hover)] disabled:opacity-50"
                >
                  {isAddingMember && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Send invitation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Client Contact Modal */}
      {showAddContactModal && targetClientForContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 animate-in fade-in duration-150">
          <div
            className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-lg overflow-hidden animate-in fade-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-raised)] px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-[var(--text)]">Add Client Contact</h2>
                <p className="text-xs text-[var(--text-2)]">{targetClientForContact.name}</p>
              </div>
              <button
                onClick={() => setShowAddContactModal(false)}
                className="rounded p-1 text-[var(--text-3)] hover:text-[var(--text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddContactSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-3)] mb-1.5">
                  Contact Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jane Smith"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-3)] mb-1.5">
                  Contact Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="jane@client.com"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-3)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>

              <div className="rounded-md border border-[var(--border)] bg-[var(--panel-raised)] p-3 text-xs text-[var(--text-2)]">
                Client contacts can only ever access projects assigned to their client. They can never manage workspace access or invite people.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddContactModal(false)}
                  className="rounded-md border border-[var(--border)] bg-[var(--panel-raised)] px-4 py-2 text-sm text-[var(--text)] hover:bg-[var(--hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingContact}
                  className="flex items-center gap-2 rounded-md bg-[var(--button)] px-4 py-2 text-sm font-medium text-[var(--button-text)] hover:bg-[var(--button-hover)] disabled:opacity-50"
                >
                  {isAddingContact && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Invite contact</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Deactivate Dialog */}
      <ConfirmDialog
        open={confirmDeactivateOpen}
        onOpenChange={setConfirmDeactivateOpen}
        title="Deactivate this person?"
        description="This person will be signed out immediately and cannot sign in. They will be hidden from @mentions and member lists. Their files, comments, and project activity will stay intact."
        confirmLabel="Deactivate"
        variant="danger"
        onConfirm={handleDeactivateMember}
      />

      {/* Confirm Remove Client Contact Dialog */}
      <ConfirmDialog
        open={confirmRemoveContactOpen}
        onOpenChange={setConfirmRemoveContactOpen}
        title="Remove client person?"
        description={`Are you sure you want to remove ${contactToRemove?.name || "this contact"}? Their client contact and project grants will be removed, and their session revoked. Their comments and uploaded files will remain in history.`}
        confirmLabel="Remove and Deactivate"
        variant="danger"
        onConfirm={handleConfirmRemoveContact}
      />
    </div>
  );
}
