"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlayheadLogoWithText } from "@/components/icons";
import { apiRequest, ApiError } from "@/lib/api";

function ResetPasswordContent() {
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
        body: JSON.stringify({ token, password }),
      });
      setSuccess(true);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 bg-[#181818]">
      <div className="mb-8 flex justify-center">
        <Link href="/">
          <PlayheadLogoWithText width={170} color="#FFFFFF" />
        </Link>
      </div>

      <div className="w-full max-w-[420px] rounded-2xl border border-[#424344] bg-[#212121] p-8 shadow-2xl">
        {success ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Password reset complete</h2>
            <p className="text-sm text-[#9A9DA0] mb-6">
              Your password has been updated. You can now log in to your account with your new credentials.
            </p>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#4876F3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3b66df] transition-colors"
            >
              Log in now
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-white">Create new password</h1>
              <p className="mt-1 text-sm text-[#9A9DA0]">
                Choose a strong password for your account
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                  New password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                  Confirm new password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] focus:outline-none focus:ring-2 focus:ring-[#4876F3] disabled:opacity-50 transition-colors"
              >
                {loading ? "Updating password..." : "Set new password"}
              </button>
            </form>

            <div className="mt-6 text-center text-xs text-[#9A9DA0]">
              <Link href="/login" className="text-[#4876F3] font-medium hover:underline">
                Back to log in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#181818]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#4876F3] border-t-transparent" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
