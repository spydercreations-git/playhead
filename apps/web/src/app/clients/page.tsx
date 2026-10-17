"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/lib/use-auth";
import { NewClientDialog } from "@/components/clients/new-client-dialog";
import { ClientCard } from "@/components/clients/client-card";
import { Icon } from "@/components/ui/icon";

interface ClientListItem {
  id: string;
  name: string;
  website: { String: string; Valid: boolean };
  logo_key?: { String: string; Valid: boolean };
  contacts_count: number;
  projects_count: number;
  total_size_bytes: number;
  updated_at: string;
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const { hasPermission, isClient } = useAuth();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");
  const [showNewClient, setShowNewClient] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientListItem | null>(null);
  const [deleteInputName, setDeleteInputName] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ clients: ClientListItem[] }>({
    queryKey: ["clients-list"],
    queryFn: () => apiRequest<{ clients: ClientListItem[] }>("/clients"),
    enabled: !isClient && hasPermission("clients.view_all"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients-list"] });
      setClientToDelete(null);
      setDeleteInputName("");
    },
    onError: (err: any) => {
      setDeleteError(err?.error || "Failed to delete client");
    },
  });

  const clients = data?.clients || [];
  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  function formatBytes(bytes: number) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  if (isClient) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <h2 className="text-lg font-bold text-white">Access Restricted</h2>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Clients do not have access to the clients management directory.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Clients
          </h1>
          <p className="text-xs text-[var(--text-2)]">
            Manage all video production clients, contacts, and access permissions
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex h-9 items-center rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3 text-xs text-[var(--text-3)] focus-within:border-[#4876F3] transition-colors">
            <input
              type="text"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40 bg-transparent text-white placeholder-[var(--text-3)] focus:outline-none text-xs"
            />
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg bg-[var(--panel)] border border-[var(--border-strong)] p-0.5">
            <button
              onClick={() => setView("table")}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                view === "table"
                  ? "bg-[var(--border)] text-white"
                  : "text-[var(--text-2)] hover:text-white"
              }`}
            >
              List
            </button>
            <button
              onClick={() => setView("grid")}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                view === "grid"
                  ? "bg-[var(--border)] text-white"
                  : "text-[var(--text-2)] hover:text-white"
              }`}
            >
              Grid
            </button>
          </div>

          {hasPermission("clients.create") && (
            <button
              onClick={() => setShowNewClient(true)}
              className="flex h-9 items-center gap-1.5 justify-center rounded-lg bg-[var(--button)] px-4 text-xs font-semibold text-[var(--button-text)] shadow hover:bg-[var(--button-hover)] transition-colors"
            >
              <Icon name="add" size={16} />
              <span>New client</span>
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-[var(--panel)] border border-[var(--border-strong)] animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)]/50 py-16 text-center">
          <Icon name="corporate_fare" size={32} className="text-white mb-3" />
          <h3 className="text-base font-semibold text-white">
            {search ? "No clients found" : "No clients yet"}
          </h3>
          <p className="mt-1 text-xs text-[var(--text-2)] max-w-sm">
            {search
              ? "No clients matched your search filter."
              : hasPermission("clients.create")
              ? "Add your first client to start sharing work with them."
              : "Ask a leader to add one."}
          </p>
          {!search && hasPermission("clients.create") && (
            <button
              onClick={() => setShowNewClient(true)}
              className="mt-4 flex items-center gap-1.5 h-9 rounded-lg bg-[var(--button)] px-4 text-xs font-semibold text-[var(--button-text)] shadow hover:bg-[var(--button-hover)] transition-colors"
            >
              <Icon name="add" size={16} />
              <span>New client</span>
            </button>
          )}
        </div>
      ) : view === "table" ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--panel)]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border-strong)] bg-[var(--border)]/50 text-[var(--text-2)]">
              <tr>
                <th className="py-3 px-4 font-medium">Client</th>
                <th className="py-3 px-4 font-medium">Contacts</th>
                <th className="py-3 px-4 font-medium">Projects</th>
                <th className="py-3 px-4 font-medium">Total Size</th>
                <th className="py-3 px-4 font-medium">Last Activity</th>
                <th className="py-3 px-4 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-strong)]/40">
              {filtered.map((client) => (
                <tr
                  key={client.id}
                  className="hover:bg-[var(--border)]/40 transition-colors group"
                >
                  <td className="py-3.5 px-4 font-medium text-white">
                    <Link
                      href={`/clients/${client.id}`}
                      className="flex items-center gap-3 hover:text-[#4876F3]"
                    >
                      {client.logo_key?.Valid && client.logo_key.String ? (
                        <img
                          src={client.logo_key.String}
                          alt={client.name}
                          className="h-8 w-8 rounded-lg object-cover border border-[var(--border)]"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4876F3]/20 font-bold text-[#4876F3] text-xs">
                          {client.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span>{client.name}</span>
                        {client.website?.Valid && (
                          <span className="text-xs text-[var(--text-2)] hover:underline">
                            {client.website.String}
                          </span>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-2)]">
                    {client.contacts_count} contacts
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-2)]">
                    {client.projects_count} projects
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-2)]">
                    {formatBytes(client.total_size_bytes)}
                  </td>
                  <td className="py-3.5 px-4 text-[var(--text-2)]">
                    {formatDate(client.updated_at)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/clients/${client.id}`}
                        className="rounded px-2.5 py-1 text-xs font-semibold text-[#4876F3] hover:bg-[#4876F3]/10"
                      >
                        Open
                      </Link>
                      {hasPermission("clients.delete") && (
                        <button
                          onClick={() => setClientToDelete(client)}
                          className="rounded px-2.5 py-1 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((client) => (
            <ClientCard
              key={client.id}
              id={client.id}
              name={client.name}
              pictureUrl={client.logo_key?.Valid && client.logo_key.String ? client.logo_key.String : null}
              peopleCount={client.contacts_count || 0}
              updatedAtText={formatDate(client.updated_at)}
              website={client.website?.Valid ? client.website.String : null}
              interactive={true}
              onMenuClick={() => {
                if (hasPermission("clients.delete")) {
                  setClientToDelete(client);
                }
              }}
            />
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal (Admin Only, requires typing client name) */}
      {clientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-red-500/40 bg-[var(--panel)] p-6 shadow-overlay">
            <h3 className="text-base font-bold text-white mb-2">
              Delete {clientToDelete.name}?
            </h3>
            <p className="text-xs text-[var(--text-2)] mb-4 leading-relaxed">
              Delete {clientToDelete.name} and its {clientToDelete.projects_count} projects? Everything moves to Trash for 30 days.
            </p>

            {deleteError && (
              <div className="mb-4 rounded-[10px] bg-red-500/10 border border-red-500/30 p-2.5 text-xs text-red-400">
                {deleteError}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs text-[var(--text-2)] mb-1.5">
                Type <strong>{clientToDelete.name}</strong> to confirm:
              </label>
              <input
                type="text"
                value={deleteInputName}
                onChange={(e) => setDeleteInputName(e.target.value)}
                placeholder={clientToDelete.name}
                className="w-full h-10 rounded-[10px] bg-[var(--input)] border border-[var(--border)] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:outline-none focus:border-[#4876F3] transition-colors"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setClientToDelete(null)}
                className="px-3.5 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-white rounded-[10px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  deleteInputName.trim() !== clientToDelete.name ||
                  deleteMutation.isPending
                }
                onClick={() => deleteMutation.mutate(clientToDelete.id)}
                className="rounded-[10px] bg-red-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-red-600 disabled:opacity-40 transition-colors"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Client"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Client Modal */}
      <NewClientDialog
        isOpen={showNewClient}
        onClose={() => setShowNewClient(false)}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ["clients-list"] })
        }
      />
    </div>
  );
}
