"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AuthContainer } from "@/components/auth/auth-container";
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
        body: JSON.stringify({ email: email.trim() }),
      });
      setSubmitted(true);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.message || apiErr.error || "Unable to process request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthContainer>
      <div className="w-full">
        {submitted ? (
          <div>
            <h1 className="text-[28px] font-bold text-white tracking-tight leading-none mb-3">
              Check your email
            </h1>
            <p className="text-sm text-[var(--text-2)] mb-8 leading-relaxed">
              If an account exists with{" "}
              <span className="font-semibold text-white">{email}</span>, we have sent instructions to reset your password.
            </p>

            <Link
              href="/login"
              className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] text-white text-sm font-semibold transition flex items-center justify-center shadow-md mb-6"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <div>
            <h1 className="text-[28px] font-bold text-white tracking-tight leading-none mb-2">
              Reset password
            </h1>
            <p className="text-sm text-[var(--text-2)] mb-8">
              Enter your work email and we&apos;ll send you a reset link.
            </p>

            {error && (
              <div className="mb-5 rounded-[10px] bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-2)] mb-2">
                  Work email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-3)]">
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
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full h-[48px] rounded-[10px] bg-[var(--input)] border border-[var(--border)] pl-10 pr-4 text-sm text-white placeholder-[var(--text-3)] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3] transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2 shadow-md"
              >
                <span>{loading ? "Sending link..." : "Send reset link"}</span>
              </button>

              <div className="pt-2 text-center text-xs text-[var(--text-2)]">
                <span>Remember your password? </span>
                <Link href="/login" className="text-[#4876F3] hover:underline font-medium">
                  Sign in
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </AuthContainer>
  );
}
