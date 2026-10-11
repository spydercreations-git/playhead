"use client";

import React, { useState } from "react";
import Link from "next/link";
import { PlayheadLogoWithText } from "@/components/icons";
import { apiRequest, ApiError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Unable to process request. Please try again.");
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
        {submitted ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#4876F3]/20 text-[#4876F3]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                <path d="m16 19 2 2 4-4" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-sm text-[#9A9DA0] mb-6">
              If an account exists with <span className="text-white font-medium">{email}</span>, we have sent instructions to reset your password.
            </p>
            <div className="rounded-lg border border-[#424344] bg-[#2E2F34] p-3 text-xs text-[#9A9DA0] mb-6">
              In local development, check Mailpit at{" "}
              <a
                href="http://localhost:8025"
                target="_blank"
                rel="noreferrer"
                className="text-[#4876F3] underline hover:text-[#688ff8]"
              >
                http://localhost:8025
              </a>
            </div>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#2E2F34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#383a42] transition-colors"
            >
              Back to log in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-white">Reset password</h1>
              <p className="mt-1 text-sm text-[#9A9DA0]">
                Enter your email and we will send you a reset link
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
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@agency.com"
                  className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] focus:outline-none focus:ring-2 focus:ring-[#4876F3] disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending..." : "Send reset instructions"}
              </button>
            </form>

            <div className="mt-6 text-center text-xs text-[#9A9DA0]">
              Remember your password?{" "}
              <Link href="/login" className="text-[#4876F3] font-medium hover:underline">
                Log in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
