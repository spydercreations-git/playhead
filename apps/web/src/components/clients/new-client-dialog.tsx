"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { apiRequest } from "@/lib/api";
import { Camera, Plus, X, Loader2 } from "@/components/ui/icon";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

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

interface PersonEntry {
  name: string;
  email: string;
}

function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
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
  const [people, setPeople] = useState<PersonEntry[]>([
    { name: "", email: "" },
  ]);
  const [sendInviteEmailsNow, setSendInviteEmailsNow] = useState(true);

  // Picture & crop states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [picturePreviewUrl, setPicturePreviewUrl] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setWebsite(initialData.website || "");
      setNotes(initialData.notes || "");
      setPeople([]);
    } else {
      setName("");
      setWebsite("");
      setNotes("");
      setPeople([{ name: "", email: "" }]);
      setSendInviteEmailsNow(true);
      setCroppedBlob(null);
      setPicturePreviewUrl(null);
      setCropSrc(null);
      setPictureError(null);
      setError(null);
    }
  }, [initialData, isOpen]);

  // Clean up preview object url
  useEffect(() => {
    return () => {
      if (picturePreviewUrl && picturePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(picturePreviewUrl);
      }
    };
  }, [picturePreviewUrl]);

  if (!isOpen) return null;

  const isEditMode = Boolean(initialData?.id);

  function handleAddPerson() {
    setPeople((prev) => [...prev, { name: "", email: "" }]);
  }

  function handleUpdatePerson(index: number, field: keyof PersonEntry, value: string) {
    setPeople((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function handleRemovePerson(index: number) {
    setPeople((prev) => prev.filter((_, idx) => idx !== index));
  }

  // Picture selection & validation
  function handleSelectPictureFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) {
      setPictureError("SVG files are not supported for client pictures. Please use PNG, JPG, or WebP.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setPictureError("Unsupported format. Please upload PNG, JPG, or WebP.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setPictureError("Image exceeds 20 MB limit. Please choose a smaller image.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setPictureError(null);
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleCropComplete(blob: Blob, dataUrl: string) {
    setCroppedBlob(blob);
    setPicturePreviewUrl(dataUrl);
    setCropSrc(null);
  }

  // Email validations & duplicate detection
  const peopleValidation = useMemo(() => {
    let invalidEmailCount = 0;
    const errors: Record<number, string> = {};

    // Map lowercase non-empty emails to index occurrences
    const emailCounts: Record<string, number> = {};
    people.forEach((p) => {
      const emailNorm = p.email.trim().toLowerCase();
      if (emailNorm) {
        emailCounts[emailNorm] = (emailCounts[emailNorm] || 0) + 1;
      }
    });

    people.forEach((p, idx) => {
      const nameTrimmed = p.name.trim();
      const emailTrimmed = p.email.trim();

      // If both name and email are empty, it's an unpopulated row (allowed, ignored)
      if (!nameTrimmed && !emailTrimmed) {
        return;
      }

      if (!emailTrimmed) {
        errors[idx] = "Enter a full email address";
        invalidEmailCount++;
        return;
      }

      if (!isValidEmail(emailTrimmed)) {
        errors[idx] = "Enter a full email address";
        invalidEmailCount++;
        return;
      }

      const emailNorm = emailTrimmed.toLowerCase();
      if (emailCounts[emailNorm] > 1) {
        errors[idx] = "Same email twice in one client is not allowed";
        invalidEmailCount++;
        return;
      }
    });

    const validFilledCount = people.filter(
      (p, idx) => p.email.trim().length > 0 && !errors[idx]
    ).length;

    return {
      errors,
      invalidEmailCount,
      validFilledCount,
    };
  }, [people]);

  const isFormValid =
    name.trim().length > 0 && peopleValidation.invalidEmailCount === 0;

  // Footer status description
  const footerStatusText = useMemo(() => {
    if (peopleValidation.invalidEmailCount > 0) {
      return `Fix ${peopleValidation.invalidEmailCount} ${
        peopleValidation.invalidEmailCount === 1 ? "email" : "emails"
      } to continue`;
    }
    if (!name.trim()) {
      return "Enter client name to continue";
    }
    if (peopleValidation.validFilledCount > 0) {
      if (sendInviteEmailsNow) {
        return `Will invite ${peopleValidation.validFilledCount} ${
          peopleValidation.validFilledCount === 1 ? "person" : "people"
        }`;
      }
      return `${peopleValidation.validFilledCount} ${
        peopleValidation.validFilledCount === 1 ? "person" : "people"
      } will be saved without invites`;
    }
    return "No people to invite";
  }, [
    peopleValidation.invalidEmailCount,
    peopleValidation.validFilledCount,
    name,
    sendInviteEmailsNow,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid || loading) return;

    try {
      setLoading(true);
      setError(null);

      if (isEditMode && initialData?.id) {
        await apiRequest(`/clients/${initialData.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            website: website.trim() || undefined,
            notes: notes.trim() || undefined,
          }),
        });

        if (croppedBlob) {
          const formData = new FormData();
          formData.append("file", croppedBlob, "client-picture.webp");
          await apiRequest(`/clients/${initialData.id}/picture`, {
            method: "POST",
            body: formData,
          });
        }
      } else {
        const validPeople = people
          .filter((p) => p.email.trim().length > 0)
          .map((p) => ({
            name: p.name.trim(),
            email: p.email.trim(),
          }));

        const res = await apiRequest<{ client: { id: string } }>("/clients", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            website: website.trim() || undefined,
            notes: notes.trim() || undefined,
            send_invite_emails_now: sendInviteEmailsNow,
            people: validPeople,
          }),
        });

        if (croppedBlob && res.client?.id) {
          const formData = new FormData();
          formData.append("file", croppedBlob, "client-picture.webp");
          await apiRequest(`/clients/${res.client.id}/picture`, {
            method: "POST",
            body: formData,
          });
        }
      }

      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.error || err?.message || "Failed to save client");
    } finally {
      setLoading(false);
    }
  }

  const avatarInitial = name.trim() ? name.trim().charAt(0).toUpperCase() : "C";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
        <div className="w-full max-w-[560px] rounded-[16px] border border-[var(--border)] bg-[var(--panel)] p-6 shadow-overlay max-h-[90vh] flex flex-col relative">
          {/* Header */}
          <div className="flex items-start justify-between pb-3">
            <div>
              <h2 className="text-base font-bold text-white">
                {isEditMode ? "Edit client" : "New client"}
              </h2>
              <p className="text-xs text-[var(--text-3)] mt-0.5">
                {isEditMode
                  ? "Update client details and notes."
                  : "A client is a company. Add the people who will review your work."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-[8px] text-[var(--text-3)] hover:text-white hover:bg-[var(--input)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="mt-2 rounded-[10px] border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {pictureError && (
            <div className="mt-2 rounded-[10px] border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {pictureError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-2 space-y-4">
            {/* Client picture avatar section */}
            <div className="flex items-center gap-4 py-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleSelectPictureFile}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-16 h-16 rounded-[16px] bg-[#0e7490] flex items-center justify-center cursor-pointer overflow-visible shrink-0 hover:opacity-90 transition-opacity"
              >
                {picturePreviewUrl ? (
                  <img
                    src={picturePreviewUrl}
                    alt="Client picture"
                    className="w-full h-full object-cover rounded-[16px]"
                  />
                ) : (
                  <span className="text-2xl font-bold text-white select-none">
                    {avatarInitial}
                  </span>
                )}
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#3B67E0] border-2 border-[var(--panel)] flex items-center justify-center text-white shadow-sm">
                  <Camera className="w-3.5 h-3.5" />
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-white">Client picture</div>
                <div className="text-xs text-[var(--text-3)]">
                  Optional. PNG, JPG or WebP. You crop it next.
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-[#4876F3] hover:underline cursor-pointer inline-block mt-0.5"
                >
                  {picturePreviewUrl ? "Change picture" : "Upload picture"}
                </button>
              </div>
            </div>

            {/* Client name & Website (two columns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                  Client name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Studio"
                  className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:border-[#4876F3] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                  Website (optional)
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="acmestudio.com"
                  className="w-full h-10 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:border-[#4876F3] focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* People section (in Create mode) */}
            {!isEditMode && (
              <div className="space-y-2 pt-1">
                <div>
                  <div className="text-sm font-semibold text-white">People</div>
                  <div className="text-xs text-[var(--text-3)] mt-0.5">
                    Each person gets their own login. Pick their projects later in Manage access.
                  </div>
                </div>

                <div className="space-y-2.5 pt-1">
                  {people.map((person, idx) => {
                    const rowError = peopleValidation.errors[idx];
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Name"
                            value={person.name}
                            onChange={(e) =>
                              handleUpdatePerson(idx, "name", e.target.value)
                            }
                            className="w-[42%] h-10 rounded-[10px] border border-[var(--border)] bg-[var(--input)] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:border-[#4876F3] focus:outline-none transition-colors"
                          />
                          <div className="flex-1 relative">
                            <input
                              type="email"
                              placeholder="name@company.com"
                              value={person.email}
                              onChange={(e) =>
                                handleUpdatePerson(idx, "email", e.target.value)
                              }
                              className={`w-full h-10 rounded-[10px] border bg-[var(--input)] px-3.5 text-xs text-white placeholder-[var(--text-3)] focus:outline-none transition-colors ${
                                rowError
                                  ? "border-red-500 focus:border-red-500"
                                  : "border-[var(--border)] focus:border-[#4876F3]"
                              }`}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemovePerson(idx)}
                            className="p-2 text-[var(--text-3)] hover:text-white rounded-[8px] hover:bg-[var(--input)] transition-colors shrink-0"
                            title="Remove person"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {rowError && (
                          <p className="text-xs text-red-400 pl-[44%] font-medium">
                            {rowError}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleAddPerson}
                  className="text-xs font-semibold text-[#4876F3] hover:underline cursor-pointer flex items-center gap-1.5 pt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add another person</span>
                </button>

                {/* Send invite emails now toggle */}
                <div className="mt-3 rounded-[12px] bg-[var(--input)]/60 border border-[var(--border)] p-3.5 flex items-center gap-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={sendInviteEmailsNow}
                    onClick={() => setSendInviteEmailsNow(!sendInviteEmailsNow)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      sendInviteEmailsNow ? "bg-[#3B67E0]" : "bg-[var(--border-strong)]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        sendInviteEmailsNow ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <div>
                    <div className="text-xs font-medium text-white">
                      Send invite emails now
                    </div>
                    <div className="text-xs text-[var(--text-3)]">
                      Turn off to add people now and invite them later.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isEditMode && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">
                  Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Brand guidelines, deliverables preferences, account notes..."
                  className="w-full rounded-[10px] border border-[var(--border)] bg-[var(--input)] p-3 text-xs text-white placeholder-[var(--text-3)] focus:border-[#4876F3] focus:outline-none resize-none transition-colors"
                />
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
              <div
                className={`text-xs ${
                  peopleValidation.invalidEmailCount > 0
                    ? "text-red-400 font-medium"
                    : "text-[var(--text-3)]"
                }`}
              >
                {!isEditMode && footerStatusText}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold text-[var(--text-2)] hover:text-white rounded-[10px] hover:bg-[var(--hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !isFormValid}
                  className="h-9 px-4 rounded-[10px] bg-[var(--button)] text-xs font-semibold text-[var(--button-text)] shadow hover:bg-[var(--button-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isEditMode ? "Save changes" : "Create client"}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Image Crop Dialog for Square Client Picture */}
      {cropSrc && (
        <ImageCropDialog
          isOpen={Boolean(cropSrc)}
          onClose={() => setCropSrc(null)}
          imageSrc={cropSrc}
          shape="square"
          title="Crop client picture"
          onCropComplete={handleCropComplete}
        />
      )}
    </>
  );
}
