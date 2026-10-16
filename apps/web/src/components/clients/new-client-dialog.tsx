"use client";

import React, { useState } from "react";
import { apiRequest } from "@/lib/api";
import { ChevronDown, X } from "lucide-react";

interface NewClientDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  initialData?: {
    id: string;
    name: string;
    website?: string;
    notes?: string;
  };
}

interface ContactRow {
  name: string;
  email: string;
  default_level: "none" | "viewer" | "commenter" | "uploader" | "full";
  can_download: boolean;
}

export function NewClientDialog({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: NewClientDialogProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [website, setWebsite] = useState(initialData?.website || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [emailOnboarding, setEmailOnboarding] = useState(true);

  React.useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setWebsite(initialData.website || "");
      setNotes(initialData.notes || "");
    } else {
      setName("");
      setWebsite("");
      setNotes("");
    }
  }, [initialData, isOpen]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleAddContactRow() {
    setContacts([
      ...contacts,
      {
        name: "",
        email: "",
        default_level: "commenter",
        can_download: false,
      },
    ]);
  }

  function handleUpdateContact(
    index: number,
    field: keyof ContactRow,
    value: any
  ) {
    const next = [...contacts];
    next[index] = { ...next[index], [field]: value };
    setContacts(next);
  }

  function handleRemoveContact(index: number) {
    setContacts(contacts.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setLoading(true);
      setError(null);

      if (initialData?.id) {
        await apiRequest(`/clients/${initialData.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            website: website.trim() || undefined,
            notes: notes.trim() || undefined,
          }),
        });
      } else {
        const payload = {
          name: name.trim(),
          website: website.trim() || undefined,
          notes: notes.trim() || undefined,
          email_onboarding: emailOnboarding,
          contacts: contacts.filter((c) => c.email.trim().length > 0),
        };

        await apiRequest("/clients", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.error || "Failed to save client");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-xl border border-[#2E2F34] bg-[#212121] p-6 shadow-overlay max-h-[90vh] flex flex-col relative">
        <div className="flex items-center justify-between pb-4 border-b border-[#2E2F34]">
          <h2 className="text-base font-bold text-white">
            {initialData?.id ? "Edit Client" : "Create New Client"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#7C7F87] hover:text-white hover:bg-[#2A2B30] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-[10px] border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A3A6AD] mb-1.5">
              Client Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Everygen, Nike, Red Bull"
              className="w-full h-10 rounded-[10px] border border-[#2E2F34] bg-[#2A2B30] px-3.5 text-xs text-white placeholder-[#7C7F87] focus:border-[#4876F3] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A3A6AD] mb-1.5">
              Website
            </label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://everygen.com"
              className="w-full h-10 rounded-[10px] border border-[#2E2F34] bg-[#2A2B30] px-3.5 text-xs text-white placeholder-[#7C7F87] focus:border-[#4876F3] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A3A6AD] mb-1.5">
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Brand guidelines, deliverables preferences, account notes..."
              className="w-full rounded-[10px] border border-[#2E2F34] bg-[#2A2B30] p-3 text-xs text-white placeholder-[#7C7F87] focus:border-[#4876F3] focus:outline-none resize-none transition-colors"
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
              <div className="rounded-[10px] border border-dashed border-[#2E2F34] p-4 text-center text-xs text-[#7C7F87]">
                No contacts added yet. Click &quot;+ Add Contact&quot; to add team or client emails.
              </div>
            ) : (
              <div className="space-y-2">
                {contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-[10px] bg-[#2A2B30] p-2 border border-[#2E2F34]"
                  >
                    <input
                      type="text"
                      placeholder="Name"
                      value={contact.name}
                      onChange={(e) =>
                        handleUpdateContact(idx, "name", e.target.value)
                      }
                      className="w-28 h-8 rounded-[8px] bg-[#212121] border border-[#2E2F34] px-2.5 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Email"
                      value={contact.email}
                      onChange={(e) =>
                        handleUpdateContact(idx, "email", e.target.value)
                      }
                      className="flex-1 h-8 rounded-[8px] bg-[#212121] border border-[#2E2F34] px-2.5 text-xs text-white placeholder-[#7C7F87] focus:outline-none focus:border-[#4876F3]"
                    />
                    <div className="relative">
                      <select
                        value={contact.default_level}
                        onChange={(e) =>
                          handleUpdateContact(idx, "default_level", e.target.value)
                        }
                        title="Access to all projects"
                        className="h-8 rounded-[8px] bg-[#212121] border border-[#2E2F34] pl-2.5 pr-8 text-xs text-white focus:outline-none focus:border-[#4876F3] appearance-none"
                      >
                        <option value="none">Access: None</option>
                        <option value="viewer">Viewer</option>
                        <option value="commenter">Commenter</option>
                        <option value="uploader">Uploader</option>
                        <option value="full">Full access</option>
                      </select>
                      <ChevronDown className="w-3 h-3 text-[#7C7F87] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                    <label
                      title="Can download files"
                      className="flex items-center gap-1 text-xs text-[#A3A6AD] shrink-0 px-1"
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
                        className="rounded border-[#2E2F34] text-[#4876F3] focus:ring-[#4876F3]"
                      />
                      DL
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(idx)}
                      className="p-1 text-[#7C7F87] hover:text-red-400 text-xs"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs text-[#A3A6AD] cursor-pointer">
              <input
                type="checkbox"
                checked={emailOnboarding}
                onChange={(e) => setEmailOnboarding(e.target.checked)}
                className="rounded border-[#2E2F34] text-[#4876F3] focus:ring-[#4876F3]"
              />
              Email contacts about their access
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#2E2F34]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-[#A3A6AD] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-[10px] bg-[#4876F3] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#3560D6] disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating..." : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
