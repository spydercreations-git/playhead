"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { apiRequest } from "@/lib/api";
import { Icon } from "@/components/ui/icon";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import { ClientCard } from "@/components/clients/client-card";

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

function getAvatarColor(identifier: string) {
  const colors = [
    "bg-teal-500/20 text-teal-300 border border-teal-500/30",
    "bg-purple-500/20 text-purple-300 border border-purple-500/30",
    "bg-blue-500/20 text-blue-300 border border-blue-500/30",
    "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    "bg-rose-500/20 text-rose-300 border border-rose-500/30",
    "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
  ];
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function NewClientDialog({
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: NewClientDialogProps) {
  // Form fields
  const [name, setName] = useState(initialData?.name || "");
  const [website, setWebsite] = useState(initialData?.website || "");
  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [sendInviteEmailsNow, setSendInviteEmailsNow] = useState(true);

  // Inline "Add a person" state
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [inlineName, setInlineName] = useState("");
  const [inlineEmail, setInlineEmail] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Picture & crop states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inlineNameInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [croppedBlob, setCroppedBlob] = useState<Blob | null>(null);
  const [picturePreviewUrl, setPicturePreviewUrl] = useState<string | null>(null);
  const [pictureError, setPictureError] = useState<string | null>(null);

  // Status & modal states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Reset form on open/initialData change
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setWebsite(initialData.website || "");
      setPeople([]);
    } else {
      setName("");
      setWebsite("");
      setPeople([]);
      setSendInviteEmailsNow(true);
      setCroppedBlob(null);
      setPicturePreviewUrl(null);
      setCropSrc(null);
      setPictureError(null);
      setError(null);
      setIsAddingPerson(false);
      setInlineName("");
      setInlineEmail("");
      setInlineError(null);
      setShowDiscardConfirm(false);
    }
  }, [initialData, isOpen]);

  // Auto-focus name field when dialog opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Auto-focus inline name input when inline add opens
  useEffect(() => {
    if (isAddingPerson) {
      inlineNameInputRef.current?.focus();
    }
  }, [isAddingPerson]);

  // Clean up object URLs
  useEffect(() => {
    return () => {
      if (picturePreviewUrl && picturePreviewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(picturePreviewUrl);
      }
    };
  }, [picturePreviewUrl]);

  const isEditMode = Boolean(initialData?.id);

  // Check if user has entered anything
  const hasTyped = useMemo(() => {
    return (
      name.trim().length > 0 ||
      website.trim().length > 0 ||
      people.length > 0 ||
      croppedBlob !== null ||
      inlineName.trim().length > 0 ||
      inlineEmail.trim().length > 0
    );
  }, [name, website, people, croppedBlob, inlineName, inlineEmail]);

  // Validation
  const validPeopleCount = useMemo(() => {
    return people.filter(
      (p) => p.email.trim().length > 0 && isValidEmail(p.email.trim())
    ).length;
  }, [people]);

  // Handle inline person add
  const handleAddInlinePerson = useCallback(() => {
    const trimmedEmail = inlineEmail.trim();
    const trimmedName = inlineName.trim();

    if (!trimmedEmail) {
      setInlineError("Enter a full email address");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setInlineError("Enter a full email address");
      return;
    }

    const emailLower = trimmedEmail.toLowerCase();
    const isDuplicate = people.some(
      (p) => p.email.trim().toLowerCase() === emailLower
    );

    if (isDuplicate) {
      setInlineError("Same email twice in one client is not allowed");
      return;
    }

    // Success: add to people list
    setPeople((prev) => [
      ...prev,
      {
        name: trimmedName || trimmedEmail.split("@")[0],
        email: trimmedEmail,
      },
    ]);

    setInlineName("");
    setInlineEmail("");
    setInlineError(null);
    setIsAddingPerson(false);
  }, [inlineEmail, inlineName, people]);

  const handleRemovePerson = useCallback((index: number) => {
    setPeople((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

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

  // Footer status message
  const footerStatusText = useMemo(() => {
    if (!name.trim()) {
      return "Enter company name to continue";
    }
    if (isAddingPerson && inlineEmail.trim()) {
      if (!isValidEmail(inlineEmail.trim())) {
        return inlineName.trim()
          ? `Fix ${inlineName.trim()}'s email`
          : "Enter a valid email address";
      }
    }
    return null;
  }, [name, isAddingPerson, inlineEmail, inlineName]);

  const isFormValid =
    name.trim().length > 0 &&
    (!isAddingPerson || (!inlineEmail.trim() && !inlineName.trim()));

  // Escape key and close handler
  const handleRequestClose = useCallback(() => {
    if (isAddingPerson) {
      setIsAddingPerson(false);
      setInlineError(null);
      return;
    }
    if (hasTyped) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  }, [isAddingPerson, hasTyped, onClose]);

  // Global keydown for Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (cropSrc) {
          setCropSrc(null);
          return;
        }
        if (showDiscardConfirm) {
          setShowDiscardConfirm(false);
          return;
        }
        handleRequestClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, cropSrc, showDiscardConfirm, handleRequestClose]);

  // Form submit
  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
          }),
        });

        if (croppedBlob) {
          try {
            const formData = new FormData();
            formData.append("file", croppedBlob, "client-picture.webp");
            await apiRequest(`/clients/${initialData.id}/picture`, {
              method: "POST",
              body: formData,
            });
          } catch (uploadErr) {
            console.error("Client picture upload failed:", uploadErr);
            setError("Client updated, but the picture failed to upload. Try again in Client settings.");
            if (onSuccess) onSuccess();
            return;
          }
        }
      } else {
        const validPeople = people.map((p) => ({
          name: p.name.trim(),
          email: p.email.trim(),
        }));

        const res = await apiRequest<any>("/clients", {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            website: website.trim() || undefined,
            send_invite_emails_now: sendInviteEmailsNow,
            people: validPeople,
          }),
        });

        const createdId = res?.id || res?.client?.id;

        if (croppedBlob && createdId) {
          try {
            const formData = new FormData();
            formData.append("file", croppedBlob, "client-picture.webp");
            await apiRequest(`/clients/${createdId}/picture`, {
              method: "POST",
              body: formData,
            });
          } catch (uploadErr) {
            console.error("Client picture upload failed:", uploadErr);
            setError("Client created, but the picture failed to upload. Try again in Client settings.");
            if (onSuccess) onSuccess();
            return;
          }
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

  // All hooks called above: early return now safe
  if (!isOpen) return null;

  return (
    <>
      {/* Background Backdrop */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
        {/* Main Modal Window (1000 x 680, rounded 20px) */}
        <div className="relative w-full max-w-[560px] min-[900px]:max-w-[1000px] h-auto min-[900px]:h-[680px] rounded-[20px] border border-[var(--border)] bg-[var(--panel)] shadow-xl overflow-hidden flex flex-col min-[900px]:flex-row">
          
          {/* Close Button Top Right */}
          <button
            type="button"
            onClick={handleRequestClose}
            className="absolute top-6 right-6 z-30 h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-3)] hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <Icon name="close" size={20} />
          </button>

          {/* LEFT COLUMN: LIVE PREVIEW (380 wide, hidden below 900px) */}
          <div
            className="hidden min-[900px]:flex w-[380px] shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex-col justify-between p-8 relative overflow-hidden"
            style={{
              backgroundImage: "var(--bg-glow)",
              backgroundPosition: "bottom center",
              backgroundRepeat: "no-repeat",
            }}
          >
            <div>
              {/* Preview Label */}
              <div className="text-[12px] font-semibold tracking-wider text-[var(--text-3)] mb-6">
                PREVIEW
              </div>

              {/* Live Client Card Component */}
              <div className="w-full">
                <ClientCard
                  name={name.trim() || "Company name"}
                  pictureUrl={picturePreviewUrl}
                  peopleCount={validPeopleCount}
                  updatedAtText="Updated just now"
                  interactive={false}
                />
              </div>
            </div>

            {/* Bottom: Upload / Change picture action */}
            <div className="pt-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleSelectPictureFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--button)] hover:opacity-90 transition-opacity cursor-pointer group"
              >
                <Icon
                  name="Camera"
                  size={18}
                  className="text-[var(--button)] group-hover:opacity-90"
                />
                <span>
                  {picturePreviewUrl ? "Change picture" : "Upload picture"}
                </span>
              </button>

              {pictureError && (
                <p className="mt-2 text-[13px] text-red-400 leading-tight">
                  {pictureError}
                </p>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: THE FORM (48px side padding) */}
          <div className="flex-1 flex flex-col justify-between px-6 py-6 min-[900px]:px-12 min-[900px]:py-8 min-[900px]:pt-10 overflow-hidden">
            
            {/* Header */}
            <div>
              <h2 className="text-[28px] min-[900px]:text-[30px] font-bold text-white tracking-tight leading-tight">
                {isEditMode ? "Edit client" : "New client"}
              </h2>
              <p className="text-[16px] text-[var(--text-2)] mt-1">
                A company you make videos for.
              </p>
            </div>

            {/* Form Fields Container */}
            <form
              id="new-client-form"
              onSubmit={handleSubmit}
              className="my-5 space-y-5 overflow-y-auto pr-1 flex-1 max-h-[460px]"
            >
              {/* Error banner */}
              {error && (
                <div className="rounded-[12px] bg-red-500/10 border border-red-500/30 p-3.5 text-[14px] text-red-400">
                  {error}
                </div>
              )}

              {/* 1. Company Name */}
              <div>
                <label
                  htmlFor="company-name-input"
                  className="block text-[14px] font-medium text-white mb-2"
                >
                  Company name
                </label>
                <input
                  id="company-name-input"
                  ref={nameInputRef}
                  type="text"
                  placeholder="Acme Studios"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-[48px] rounded-[12px] bg-[var(--input)] border border-[var(--border)] px-4 text-[16px] text-white placeholder-[var(--text-3)] focus:border-[var(--button)] outline-none transition-colors"
                />
              </div>

              {/* 2. Website */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label
                    htmlFor="company-website-input"
                    className="text-[14px] font-medium text-white"
                  >
                    Website
                  </label>
                  <span className="text-[13px] text-[var(--text-3)]">
                    Optional
                  </span>
                </div>
                <div className="relative">
                  <Icon
                    name="globe"
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none"
                  />
                  <input
                    id="company-website-input"
                    type="text"
                    placeholder="acmeworks.com"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && isFormValid) {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    className="w-full h-[48px] rounded-[12px] bg-[var(--input)] border border-[var(--border)] pl-11 pr-4 text-[16px] text-white placeholder-[var(--text-3)] focus:border-[var(--button)] outline-none transition-colors"
                  />
                </div>
              </div>

              {/* 3. People who review */}
              <div>
                <label className="block text-[14px] font-medium text-white mb-2">
                  People who review
                </label>

                <div className="space-y-2.5">
                  {/* Added people list */}
                  {people.map((person, idx) => (
                    <div
                      key={idx}
                      className="h-[52px] rounded-[12px] bg-[var(--input)] border border-[var(--border)] px-3.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`h-8 w-8 rounded-full ${getAvatarColor(
                            person.name || person.email
                          )} font-bold text-[13px] flex items-center justify-center shrink-0`}
                        >
                          {(person.name || person.email || "P")
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[15px] font-medium text-white truncate leading-tight">
                            {person.name || "Reviewer"}
                          </span>
                          <span className="text-[13px] text-[var(--text-3)] truncate leading-tight">
                            {person.email}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemovePerson(idx)}
                        className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-3)] hover:text-white hover:bg-white/10 transition-colors shrink-0"
                        title="Remove"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  ))}

                  {/* "Add a person" Dashed or Inline mode */}
                  {isAddingPerson ? (
                    <div className="space-y-1.5">
                      <div className="h-[52px] rounded-[12px] bg-[var(--input)] border border-[var(--button)] px-3 flex items-center gap-2.5">
                        <input
                          ref={inlineNameInputRef}
                          type="text"
                          placeholder="Name"
                          value={inlineName}
                          onChange={(e) => {
                            setInlineName(e.target.value);
                            setInlineError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddInlinePerson();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              setIsAddingPerson(false);
                              setInlineError(null);
                            }
                          }}
                          className="flex-1 bg-transparent text-[15px] text-white placeholder-[var(--text-3)] outline-none min-w-0"
                        />
                        <div className="h-5 w-px bg-[var(--border)] shrink-0" />
                        <input
                          type="email"
                          placeholder="Email address"
                          value={inlineEmail}
                          onChange={(e) => {
                            setInlineEmail(e.target.value);
                            setInlineError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddInlinePerson();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              setIsAddingPerson(false);
                              setInlineError(null);
                            }
                          }}
                          className="flex-1 bg-transparent text-[15px] text-white placeholder-[var(--text-3)] outline-none min-w-0"
                        />
                        <button
                          type="button"
                          onClick={handleAddInlinePerson}
                          className="h-[36px] px-3.5 rounded-[8px] bg-[var(--button)] hover:bg-[var(--button-hover)] text-[var(--button-text)] text-[14px] font-semibold transition-colors shrink-0"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsAddingPerson(false);
                            setInlineError(null);
                          }}
                          className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-3)] hover:text-white transition-colors shrink-0"
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </div>

                      {inlineError && (
                        <p className="text-[13px] text-red-400 pl-1">
                          {inlineError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingPerson(true);
                        setInlineName("");
                        setInlineEmail("");
                        setInlineError(null);
                      }}
                      className="w-full h-[52px] rounded-[12px] border border-dashed border-[var(--border)] hover:border-[var(--border-strong)] flex items-center px-4 gap-3 text-[var(--text-2)] hover:text-white transition-colors cursor-pointer group"
                    >
                      <Icon
                        name="person_add"
                        size={18}
                        className="text-[var(--text-2)] group-hover:text-white transition-colors"
                      />
                      <span className="text-[15px] font-medium">
                        Add a person
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* 4. Checkbox "Email them an invite now" */}
              <div className="pt-1">
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sendInviteEmailsNow}
                    onChange={(e) => setSendInviteEmailsNow(e.target.checked)}
                    className="h-[18px] w-[18px] rounded-[4px] border-[var(--border)] accent-[var(--button)] cursor-pointer"
                  />
                  <span className="text-[15px] text-white font-normal">
                    Email them an invite now
                  </span>
                </label>
              </div>
            </form>

            {/* Footer with Divider */}
            <div className="border-t border-[var(--border)] pt-5 flex items-center justify-between mt-auto">
              {/* Short error/status text on left */}
              <div className="min-w-0 pr-4">
                {footerStatusText && (
                  <span className="text-[13px] text-red-400 font-medium truncate block">
                    {footerStatusText}
                  </span>
                )}
              </div>

              {/* Right: Cancel & Create buttons */}
              <div className="flex items-center gap-4 shrink-0">
                <button
                  type="button"
                  onClick={handleRequestClose}
                  className="px-3 py-2 text-[15px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={!isFormValid || loading}
                  onClick={() => handleSubmit()}
                  className="h-[44px] w-[160px] rounded-[12px] bg-[var(--button)] hover:bg-[var(--button-hover)] text-[var(--button-text)] font-semibold text-[15px] disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <Icon name="progress_activity" size={18} className="animate-spin text-[var(--button-text)]" />
                      <span>Saving...</span>
                    </div>
                  ) : (
                    <span>{isEditMode ? "Save changes" : "Create client"}</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="w-full max-w-[400px] rounded-[16px] border border-[var(--border)] bg-[var(--panel)] p-6 shadow-xl">
            <h3 className="text-[20px] font-bold text-white">
              Discard this client?
            </h3>
            <p className="mt-2 text-[14px] text-[var(--text-2)] leading-relaxed">
              You have unsaved changes. Are you sure you want to discard them?
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 text-[14px] font-medium text-[var(--text-2)] hover:text-white transition-colors"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="h-[38px] px-4 rounded-[10px] bg-red-600 hover:bg-red-500 text-white font-semibold text-[14px] transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Crop Tool (Square aspect ratio) */}
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
