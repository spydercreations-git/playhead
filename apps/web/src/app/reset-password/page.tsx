"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthContainer } from "@/components/auth/auth-container";
import { apiRequest, ApiError } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!token) {
      setError("Missing or invalid reset token in URL.");
      return;
    }

    setLoading(true);

    try {
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, new_password: password }),
      });
      setSuccess(true);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.message || apiErr.error || "Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      {success ? (
        <div>
          <h1 className="text-[34px] font-bold text-white tracking-tight leading-none mb-3">
            Password updated
          </h1>
          <p className="text-sm text-[#8E9096] mb-8 leading-relaxed">
            Your password has been reset successfully. You can now sign in with your new password.
          </p>
          <Link
            href="/login"
            className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] text-white text-sm font-semibold transition flex items-center justify-center shadow-md mb-6"
          >
            Sign in to Playhead
          </Link>
        </div>
      ) : (
        <div>
          <h1 className="text-[34px] font-bold text-white tracking-tight leading-none mb-2">
            Create new password
          </h1>
          <p className="text-sm text-[#8E9096] mb-8">
            Choose a new password of at least 8 characters.
          </p>

          {error && (
            <div className="mb-5 rounded-[10px] bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#9A9DA0] mb-2">
                New password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#7C7F87]">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input
                  type="password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full h-[48px] rounded-[10px] bg-[#2A2B30] border border-[#3A3B40] pl-10 pr-4 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3] transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9A9DA0] mb-2">
                Confirm new password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#7C7F87]">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your new password"
                  className="w-full h-[48px] rounded-[10px] bg-[#2A2B30] border border-[#3A3B40] pl-10 pr-4 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2 shadow-md"
            >
              <span>{loading ? "Updating password..." : "Update password"}</span>
            </button>

            <div className="pt-2 text-center text-xs text-[#9A9DA0]">
              <Link href="/login" className="text-[#4876F3] hover:underline font-medium">
                Back to sign in
              </Link>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthContainer>
      <Suspense fallback={<div className="text-sm text-[#7C7F87]">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthContainer>
  );
}
