"use client";

import React, { useState } from "react";
import { apiRequest } from "@/lib/api";

interface ContactRow {
  name: string;
  email: string;
  default_level: string;
  can_download: boolean;
}

interface NewClientDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newClient: any) => void;
}

export function NewClientDialog({
  isOpen,
  onClose,
  onSuccess,
}: NewClientDialogProps) {
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [emailOnboarding, setEmailOnboarding] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleAddContactRow() {
    setContacts([
      ...contacts,
      {
        name: "",
        email: "",
        default_level: "none",
        can_download: true,
      },
    ]);
  }

  function handleUpdateContact(
    index: number,
    field: keyof ContactRow,
    value: any
  ) {
    const updated = [...contacts];
    updated[index] = { ...updated[index], [field]: value };
    setContacts(updated);
  }

  function handleRemoveContact(index: number) {
    setContacts(contacts.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Client name is required");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        website: website.trim(),
        notes: notes.trim(),
        contacts: contacts.filter((c) => c.email.trim() !== ""),
        email_onboarding: emailOnboarding,
      };

      const result = await apiRequest("/clients", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onSuccess(result);
      onClose();
    } catch (err: any) {
      setError(err?.error || "Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-xl border border-[#424344] bg-[#212121] p-6 shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-[#424344]/60">
          <h2 className="text-lg font-bold text-white">Create New Client</h2>
          <button
            onClick={onClose}
            className="text-[#9A9DA0] hover:text-white text-lg p-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
              Client Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Everygen, Nike, Red Bull"
              className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
              Website
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://everygen.com"
              className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9A9DA0] mb-1.5">
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Brand guidelines, deliverables preferences, account notes..."
              className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none resize-none"
            />
          </div>

          {/* Client Contacts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-white">
                Client Contacts
              </label>
              <button
                type="button"
                onClick={handleAddContactRow}
                className="text-xs font-semibold text-[#4876F3] hover:underline"
              >
                + Add Contact
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#424344] p-4 text-center text-xs text-[#747678]">
                No contacts added yet. Click &quot;+ Add Contact&quot; to add team or client emails.
              </div>
            ) : (
              <div className="space-y-2.5">
                {contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-lg bg-[#2E2F34] p-2.5 border border-[#424344]"
                  >
                    <input
                      type="text"
                      placeholder="Name"
                      value={contact.name}
                      onChange={(e) =>
                        handleUpdateContact(idx, "name", e.target.value)
                      }
                      className="w-28 rounded bg-[#212121] border border-[#424344] px-2 py-1 text-xs text-white placeholder-[#686B6E] focus:outline-none"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Email"
                      value={contact.email}
                      onChange={(e) =>
                        handleUpdateContact(idx, "email", e.target.value)
                      }
                      className="flex-1 rounded bg-[#212121] border border-[#424344] px-2 py-1 text-xs text-white placeholder-[#686B6E] focus:outline-none"
                    />
                    <select
                      value={contact.default_level}
                      onChange={(e) =>
                        handleUpdateContact(idx, "default_level", e.target.value)
                      }
                      title="Access to all projects"
                      className="rounded bg-[#212121] border border-[#424344] px-2 py-1 text-xs text-white focus:outline-none"
                    >
                      <option value="none">Access: None</option>
                      <option value="viewer">Viewer</option>
                      <option value="commenter">Commenter</option>
                      <option value="uploader">Uploader</option>
                      <option value="full">Full access</option>
                    </select>
                    <label
                      title="Can download files"
                      className="flex items-center gap-1 text-[11px] text-[#9A9DA0] shrink-0"
                    >
                      <input
                        type="checkbox"
                        checked={contact.can_download}
                        onChange={(e) =>
                          handleUpdateContact(
                            idx,
                            "can_download",
                            e.target.checked
                          )
                        }
                        className="rounded border-[#424344]"
                      />
                      DL
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(idx)}
                      className="text-[#9A9DA0] hover:text-red-400 text-xs px-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs text-[#9A9DA0]">
              <input
                type="checkbox"
                checked={emailOnboarding}
                onChange={(e) => setEmailOnboarding(e.target.checked)}
                className="rounded border-[#424344]"
              />
              Email contacts about their access
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#424344]/60">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-[#9A9DA0] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3b66df] disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
