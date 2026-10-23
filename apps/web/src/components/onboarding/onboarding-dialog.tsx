"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PlayheadLogoWithText } from "@/components/icons";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Folder,
  TableChart,
  VideoFileIcon,
  PdfFileIcon,
  Eye,
  EyeOff,
  Camera,
  ArrowRight,
  ArrowLeft,
  Loader2,
} from "@/components/ui/icon";
import { useAuth, AUTH_QUERY_KEY } from "@/lib/use-auth";
import { apiRequest, ApiError } from "@/lib/api";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";

export interface OnboardingDialogProps {
  isOpen: boolean;
}

export function OnboardingDialog({ isOpen }: OnboardingDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isClient, roleName, clientName, clientLogo, refetch } = useAuth();

  const [step, setStep] = useState<1 | 2>(1);

  // Profile Form state
  const [fullName, setFullName] = useState(user?.name || "");
  const [username, setUsername] = useState(
    user?.username || (user?.email ? user.email.split("@")[0].replace(/[^a-zA-Z0-9.]/g, "").toLowerCase() : "")
  );
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatar_url || user?.avatar || null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Username validation state
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [isUsernameAvailable, setIsUsernameAvailable] = useState<boolean | null>(null);
  const [usernameMessage, setUsernameMessage] = useState<string>("");

  // Crop dialog state
  const [cropOpen, setCropOpen] = useState(false);
  const [selectedCropFile, setSelectedCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTempPassword = !!user?.has_temp_password;

  // Sync user initial values
  useEffect(() => {
    if (user?.name && !fullName) {
      setFullName(user.name);
    }
    if (user?.avatar_url && !avatarUrl) {
      setAvatarUrl(user.avatar_url);
    }
  }, [user]);

  // Debounced live username availability check
  useEffect(() => {
    const cleanUser = username.trim().replace(/^@/, "");
    if (!cleanUser) {
      setIsUsernameAvailable(null);
      setUsernameMessage("");
      return;
    }

    if (!/^[a-zA-Z0-9.]{3,30}$/.test(cleanUser)) {
      setIsUsernameAvailable(false);
      setUsernameMessage("Letters, numbers and dots only (3-30 characters).");
      return;
    }

    setCheckingUsername(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiRequest<{ available: boolean; username: string; message?: string }>(
          `/users/check-username?username=${encodeURIComponent(cleanUser)}`
        );
        setIsUsernameAvailable(res.available);
        if (res.available) {
          setUsernameMessage(`@${cleanUser} is available. Letters, numbers and dots.`);
        } else {
          setUsernameMessage(res.message || `@${cleanUser} is already taken.`);
        }
      } catch {
        setIsUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username]);

  if (!isOpen) return null;

  // Validation rules for Step 1
  const isNameValid = fullName.trim().length > 0;
  const isUserValid = isUsernameAvailable === true;
  const isPhotoValid = !hasTempPassword || !!avatarUrl;
  const isPasswordValid = !hasTempPassword || newPassword.length >= 8;
  const canContinue = isNameValid && isUserValid && isPhotoValid && isPasswordValid && !checkingUsername;

  function handlePhotoUploadClick() {
    fileInputRef.current?.click();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedCropFile(file);
      setCropOpen(true);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleCropSaved(croppedBlob: Blob, croppedDataUrl: string) {
    setAvatarUrl(croppedDataUrl);
    // Upload avatar to backend
    const formData = new FormData();
    formData.append("file", croppedBlob, "avatar.webp");
    try {
      const res = await apiRequest<{ avatar_url: string }>("/users/avatar", {
        method: "POST",
        body: formData,
      });
      if (res?.avatar_url) {
        setAvatarUrl(res.avatar_url);
      }
    } catch (err: any) {
      console.error("Failed to upload avatar", err);
    }
  }

  function handleStep1Continue(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue) return;
    setError(null);
    setStep(2);
  }

  async function handleCompleteOnboarding() {
    setSaving(true);
    setError(null);

    try {
      const cleanUsername = username.trim().replace(/^@/, "");
      await apiRequest("/users/onboarding/complete", {
        method: "POST",
        body: JSON.stringify({
          name: fullName.trim(),
          username: cleanUsername,
          avatar_url: avatarUrl,
          new_password: hasTempPassword ? newPassword : (newPassword ? newPassword : ""),
        }),
      });

      // Refetch user auth state so is_onboarded becomes true
      await refetch();
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });

      // Navigate to Home
      router.push("/");
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.message || "Failed to complete setup");
    } finally {
      setSaving(false);
    }
  }

  const initialLetter = fullName ? fullName.charAt(0).toUpperCase() : user?.email ? user.email.charAt(0).toUpperCase() : "U";
  const userFirstName = fullName ? fullName.split(" ")[0] : "there";
  const roleDisplay = roleName || "Team Member";
  const clientDisplayName = clientName || "Your Team";

  return (
    <>
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 select-none">
        <div
          className="w-full max-w-[680px] bg-[var(--panel)] border border-[var(--border)] rounded-[16px] shadow-xl overflow-hidden flex flex-col"
          role="dialog"
          aria-modal="true"
        >
          {/* Top Bar Header with Playhead Logo and Step Indicator */}
          <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-[var(--border)]">
            <div className="flex items-center">
              <PlayheadLogoWithText width={120} color="#FFFFFF" />
            </div>

            {/* Step Indicator (matching mockups O1-O4) */}
            <div className="flex items-center gap-6 text-[13px] font-medium">
              <div
                className={`relative pb-1.5 flex items-center gap-1.5 transition-colors ${
                  step === 1 ? "text-white font-semibold" : "text-[var(--text-2)]"
                }`}
              >
                {step === 2 ? (
                  <div className="flex items-center gap-1.5 text-[#3FCF8E]">
                    <CheckCircle2 size={16} />
                    <span className="text-[var(--text-2)]">Profile</span>
                  </div>
                ) : (
                  <>
                    <span className="tabular-nums">1</span>
                    <span>Profile</span>
                  </>
                )}
                {step === 1 && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4876F3] rounded-full" />
                )}
              </div>

              <div
                className={`relative pb-1.5 flex items-center gap-1.5 transition-colors ${
                  step === 2 ? "text-white font-semibold" : "text-[var(--text-2)]"
                }`}
              >
                <span className="tabular-nums">2</span>
                <span>Welcome</span>
                {step === 2 && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#4876F3] rounded-full" />
                )}
              </div>
            </div>
          </div>

          {/* STEP 1: Profile Setup (O1 & O2) */}
          {step === 1 && (
            <form onSubmit={handleStep1Continue} className="p-7 space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Set up your profile</h1>
                <p className="text-sm text-[var(--text-2)] mt-1">This is how Idyll and your clients will see you.</p>
              </div>

              {/* Photo Upload Section */}
              <div className="flex items-center gap-4 py-1">
                <div className="relative">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={fullName}
                      className="w-[72px] h-[72px] rounded-full object-cover border border-[var(--border-strong)]"
                    />
                  ) : (
                    <div className="w-[72px] h-[72px] rounded-full bg-[#FFBB56] flex items-center justify-center text-2xl font-bold text-[var(--bg)] border border-[var(--border-strong)]">
                      {initialLetter}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handlePhotoUploadClick}
                    title="Upload photo"
                    className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#4876F3] hover:bg-[#3560D6] rounded-full flex items-center justify-center text-white shadow-md border-2 border-[var(--panel)] transition-colors"
                  >
                    <Camera size={16} />
                  </button>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {hasTempPassword ? "Add a photo" : "From your Google account"}
                  </h3>
                  <p className="text-xs text-[var(--text-2)] mt-0.5">
                    {hasTempPassword ? "Required. Square works best." : "Keep it, or upload another."}
                  </p>
                  <button
                    type="button"
                    onClick={handlePhotoUploadClick}
                    className="text-xs font-semibold text-[#4876F3] hover:underline mt-1 block cursor-pointer"
                  >
                    Upload new photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,.heic"
                    className="hidden"
                    onChange={handleFileSelected}
                  />
                </div>
              </div>

              {/* Full Name Field */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Full name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Harsh Pawar"
                  className="w-full bg-[var(--input)] border border-[var(--border-strong)] rounded-[8px] px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#4876F3] transition-colors"
                  required
                />
              </div>

              {/* Username Field with live validation */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Username</label>
                <div
                  className={`flex items-center bg-[var(--input)] border rounded-[8px] px-3.5 py-2.5 transition-colors ${
                    isUsernameAvailable === true
                      ? "border-[#3FCF8E]"
                      : isUsernameAvailable === false
                      ? "border-[#F0506E]"
                      : "border-[var(--border-strong)] focus-within:border-[#4876F3]"
                  }`}
                >
                  <span className="text-sm text-[var(--text-2)] mr-0.5 select-none font-medium">@</span>
                  <input
                    type="text"
                    value={username.replace(/^@/, "")}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder="username"
                    className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                    required
                  />
                  {checkingUsername && <Loader2 size={16} className="text-[var(--text-2)] animate-spin" />}
                  {!checkingUsername && isUsernameAvailable === true && (
                    <CheckCircle2 size={16} className="text-[#3FCF8E]" />
                  )}
                </div>
                {usernameMessage && (
                  <p
                    className={`text-xs mt-1.5 ${
                      isUsernameAvailable === true ? "text-[#3FCF8E]" : "text-[#F0506E]"
                    }`}
                  >
                    {usernameMessage}
                  </p>
                )}
              </div>

              {/* New Password Field (only for Temporary Password users) */}
              {hasTempPassword && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full bg-[var(--input)] border border-[var(--border-strong)] rounded-[8px] px-3.5 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-[#4876F3] transition-colors"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-2)] hover:text-white"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {newPassword && newPassword.length < 8 && (
                    <p className="text-xs text-[#F0506E] mt-1.5">Password must be at least 8 characters.</p>
                  )}
                </div>
              )}

              {error && <p className="text-xs text-[#F0506E] mt-1">{error}</p>}

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                <span className="text-xs text-[var(--text-3)] font-medium">Step 1 of 2</span>
                <button
                  type="submit"
                  disabled={!canContinue}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#4876F3] hover:bg-[#3560D6] disabled:opacity-50 disabled:cursor-not-allowed rounded-[8px] text-sm font-semibold text-white transition-colors"
                >
                  <span>Continue</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Welcome Screen (O3 Team & O4 Client) */}
          {step === 2 && (
            <div className="p-7 space-y-6">
              {/* Badge & Welcome Header */}
              <div>
                {!isClient ? (
                  // Team Badge (O3)
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--input)] border border-[var(--border-strong)] mb-3">
                    <div className="w-4 h-4 rounded-full bg-[var(--bg)] flex items-center justify-center text-xs font-bold text-white">
                      IP
                    </div>
                    <span className="text-xs text-[var(--text-2)]">
                      You&apos;re joining Idyll Productions as <span className="text-white font-medium">{roleDisplay}</span>
                    </span>
                  </div>
                ) : (
                  // Client Badge (O4)
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--input)] border border-[var(--border-strong)] mb-3">
                    <div className="w-4 h-4 rounded-full bg-[#3FCF8E] flex items-center justify-center text-xs font-bold text-[var(--bg)]">
                      {clientDisplayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs font-semibold text-white">{clientDisplayName}</span>
                  </div>
                )}

                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {!isClient ? `Welcome to Playhead, ${userFirstName}` : `Welcome, ${userFirstName}`}
                </h1>
                <p className="text-sm text-[var(--text-2)] mt-1">
                  {!isClient
                    ? "Three things you'll do every day."
                    : "Idyll Productions shares your videos here. Watch, comment on any frame, and approve."}
                </p>
              </div>

              {/* 3 Real UI Component Snippets (No illustrations!) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {!isClient ? (
                  // Team Snippets (O3)
                  <>
                    {/* Snippet 1: Projects and folders */}
                    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-3 flex flex-col justify-between">
                      <div className="bg-[var(--panel)] rounded-[8px] p-2.5 mb-3 border border-[var(--border)] space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-white font-medium">
                          <ChevronDown size={16} className="text-[var(--text-2)]" />
                          <Folder size={16} className="text-[#3FCF8E]" />
                          <span className="truncate">{clientName ? `${clientName} Projects` : "Client Projects"}</span>
                        </div>
                        <div className="pl-5 space-y-1 text-xs text-[var(--text-2)]">
                          <div className="flex items-center gap-1.5">
                            <Folder size={16} className="text-[var(--text-2)]" />
                            <span>Raw files</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Folder size={16} className="text-[var(--text-2)]" />
                            <span>Edited files</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[#3FCF8E]">
                            <TableChart size={16} />
                            <span>Project tracker</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-white">Projects and folders</h4>
                        <p className="text-xs text-[var(--text-2)] mt-0.5 leading-snug">
                          Every client has projects. Files live in folders.
                        </p>
                      </div>
                    </div>

                    {/* Snippet 2: Frame accurate review */}
                    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-3 flex flex-col justify-between">
                      <div className="bg-[var(--panel)] rounded-[8px] p-2.5 mb-3 border border-[var(--border)]">
                        <div className="flex items-center justify-between text-xs text-white font-medium">
                          <span className="truncate">Jada_Final_v3.mp4</span>
                        </div>
                        <span className="text-xs text-[var(--text-3)]">v3 · 01:15</span>

                        {/* Timeline scrubber with comment pins */}
                        <div className="relative mt-3 mb-2 flex items-center">
                          <div className="w-full h-1 bg-[var(--border)] rounded-full relative">
                            <div className="w-1/2 h-full bg-[#4876F3] rounded-full" />
                            {/* Scrubber head */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow" />
                            {/* Comment pin S */}
                            <div className="absolute -top-3 left-[20%] w-3.5 h-3.5 bg-[#4876F3] rounded-full text-xs text-white flex items-center justify-center font-bold">
                              S
                            </div>
                            {/* Comment pin R */}
                            <div className="absolute -top-3 left-[50%] w-3.5 h-3.5 bg-[#9787FF] rounded-full text-xs text-white flex items-center justify-center font-bold">
                              R
                            </div>
                            {/* Comment pin S */}
                            <div className="absolute -top-3 left-[80%] w-3.5 h-3.5 bg-[#4876F3] rounded-full text-xs text-white flex items-center justify-center font-bold">
                              S
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-[var(--text-3)] block text-center mt-1">Comment on any frame</span>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-white">Frame accurate review</h4>
                        <p className="text-xs text-[var(--text-2)] mt-0.5 leading-snug">
                          Comment on the exact frame. Versions stay together.
                        </p>
                      </div>
                    </div>

                    {/* Snippet 3: Fast uploads */}
                    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-3 flex flex-col justify-between">
                      <div className="bg-[var(--panel)] rounded-[8px] p-2.5 mb-3 border border-[var(--border)] space-y-2">
                        {/* Upload item 1: active */}
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-[var(--input)] flex items-center justify-center text-[#FFBB56]">
                            <VideoFileIcon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-white truncate">Raw_take_04.mov</span>
                            </div>
                            <span className="text-xs text-[#4876F3] font-medium">64% · 1 min left</span>
                            <div className="w-full h-1 bg-[var(--border)] rounded-full mt-1 overflow-hidden">
                              <div className="w-[64%] h-full bg-[#4876F3]" />
                            </div>
                          </div>
                        </div>

                        {/* Upload item 2: done */}
                        <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                          <div className="w-6 h-6 rounded bg-[var(--input)] flex items-center justify-center text-[#4876F3]">
                            <PdfFileIcon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white truncate">Brief.pdf</div>
                            <span className="text-xs text-[#3FCF8E] font-medium">Done</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-white">Fast uploads</h4>
                        <p className="text-xs text-[var(--text-2)] mt-0.5 leading-snug">
                          Drop anything. Big files resume if the internet drops.
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  // Client Snippets (O4)
                  <>
                    {/* Snippet 1: Watch and comment */}
                    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-3 flex flex-col justify-between">
                      <div className="bg-[var(--panel)] rounded-[8px] p-2.5 mb-3 border border-[var(--border)]">
                        <div className="text-xs text-white font-medium truncate">Jada_Final_v3.mp4</div>
                        <span className="text-xs text-[var(--text-3)]">v3 · 01:15</span>

                        <div className="relative mt-3 mb-2 flex items-center">
                          <div className="w-full h-1 bg-[var(--border)] rounded-full relative">
                            <div className="w-1/2 h-full bg-[#4876F3] rounded-full" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow" />
                            <div className="absolute -top-3 left-[20%] w-3.5 h-3.5 bg-[#4876F3] rounded-full text-xs text-white flex items-center justify-center font-bold">
                              S
                            </div>
                            <div className="absolute -top-3 left-[50%] w-3.5 h-3.5 bg-[#9787FF] rounded-full text-xs text-white flex items-center justify-center font-bold">
                              R
                            </div>
                            <div className="absolute -top-3 left-[80%] w-3.5 h-3.5 bg-[#4876F3] rounded-full text-xs text-white flex items-center justify-center font-bold">
                              S
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-[var(--text-3)] block text-center mt-1">Comment on any frame</span>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-white">Watch and comment</h4>
                        <p className="text-xs text-[var(--text-2)] mt-0.5 leading-snug">
                          Click the timeline, type, done. Idyll sees it at that exact frame.
                        </p>
                      </div>
                    </div>

                    {/* Snippet 2: Approve */}
                    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-3 flex flex-col justify-between">
                      <div className="bg-[var(--panel)] rounded-[8px] p-3 mb-3 border border-[var(--border)] flex flex-col items-start gap-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--input)] text-[#FFBB56] text-xs font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FFBB56]" />
                          Needs review
                        </span>
                        <div className="flex items-center gap-2 w-full">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4876F3] rounded-[6px] text-xs font-semibold text-white pointer-events-none"
                          >
                            <Check size={16} />
                            <span>Approve</span>
                          </button>
                          <span className="text-xs text-[var(--text-3)]">v3</span>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-white">Approve</h4>
                        <p className="text-xs text-[var(--text-2)] mt-0.5 leading-snug">
                          Happy with a version? Hit Approve and Idyll gets notified.
                        </p>
                      </div>
                    </div>

                    {/* Snippet 3: Everything in one place */}
                    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-[10px] p-3 flex flex-col justify-between">
                      <div className="bg-[var(--panel)] rounded-[8px] p-2 mb-3 border border-[var(--border)] grid grid-cols-3 gap-1.5">
                        <div className="aspect-[9/16] bg-[var(--input)] rounded-[6px] relative overflow-hidden flex items-center justify-center">
                          <div className="w-4 h-4 rounded-full bg-[#4876F3]/40" />
                        </div>
                        <div className="aspect-[9/16] bg-[var(--hover)] rounded-[6px] relative overflow-hidden flex items-center justify-center">
                          <div className="w-4 h-4 rounded-full bg-[#FFBB56]/40" />
                        </div>
                        <div className="aspect-[9/16] bg-[var(--panel-raised)] rounded-[6px] relative overflow-hidden flex items-center justify-center">
                          <div className="w-4 h-4 rounded-full bg-[#3FCF8E]/40" />
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-white">Everything in one place</h4>
                        <p className="text-xs text-[var(--text-2)] mt-0.5 leading-snug">
                          Every video, version and comment for {clientDisplayName}.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {error && <p className="text-xs text-[#F0506E] mt-1">{error}</p>}

              {/* Step 2 Bottom Navigation */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-2)] hover:text-white transition-colors"
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={handleCompleteOnboarding}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#4876F3] hover:bg-[#3560D6] rounded-[8px] text-sm font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  <span>Get started</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Embedded Crop Dialog for profile photo editing */}
      <ImageCropDialog
        isOpen={cropOpen}
        onClose={() => setCropOpen(false)}
        imageFile={selectedCropFile}
        shape="circle"
        title="Crop profile photo"
        onCropComplete={handleCropSaved}
      />
    </>
  );
}
