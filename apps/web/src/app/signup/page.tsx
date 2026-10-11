"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayheadLogoWithText } from "@/components/icons";
import { apiRequest, ApiError } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRequest("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      setSubmitted(true);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Unable to create account. Please try again.");
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

      <div className="w-full max-w-[440px] rounded-2xl border border-[#424344] bg-[#212121] p-8 shadow-2xl">
        {submitted ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#4876F3]/20 text-[#4876F3]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                <path d="m16 19 2 2 4-4" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Check your inbox</h2>
            <p className="text-sm text-[#9A9DA0] mb-6">
              We sent a verification link to <span className="text-white font-medium">{email}</span>. Click the link in that email to activate your account and start your 14-day trial.
            </p>
            <div className="rounded-lg border border-[#424344] bg-[#2E2F34] p-3 text-xs text-[#9A9DA0] mb-6">
              In local development, emails are captured in Mailpit at{" "}
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
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#2E2F34] px-4 py-3 text-sm font-semibold text-white hover:bg-[#383a42] transition-colors"
            >
              Back to log in
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-white">Create your account</h1>
              <p className="mt-1 text-sm text-[#9A9DA0]">
                Start your 14-day free trial. Up to 5 team seats included.
              </p>
            </div>

            {error && (
              <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
                {error}
              </div>
            )}

            {googleClientId && (
              <div className="mb-6">
                <a
                  href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"}/auth/google/url`}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#424344] bg-[#2E2F34] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#383a42]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  Continue with Google
                </a>
                <div className="relative my-6 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#424344]"></div>
                  </div>
                  <span className="relative bg-[#212121] px-3 text-xs uppercase tracking-wider text-[#9A9DA0]">
                    Or with email
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                  Full name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                  Work email
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

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                  Password
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

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] focus:outline-none focus:ring-2 focus:ring-[#4876F3] disabled:opacity-50 transition-colors"
              >
                {loading ? "Creating account..." : "Start free trial"}
              </button>
            </form>

            <div className="mt-6 text-center text-xs text-[#9A9DA0]">
              Already have an account?{" "}
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
