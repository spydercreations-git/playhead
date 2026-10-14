"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayheadLogoWithText } from "@/components/icons";
import { apiRequest, ApiError } from "@/lib/api";

type AuthMode = "code" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("code");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRequest("/auth/code/send", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setCodeSent(true);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(
        apiErr.error ||
          "This email doesn't have access to Playhead yet. Ask the person who invited you."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRequest("/auth/code/verify", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
        }),
      });
      router.push("/");
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Invalid or expired verification code.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      router.push("/");
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(
        apiErr.error ||
          "This email doesn't have access to Playhead yet. Ask the person who invited you."
      );
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
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Log in to Playhead
          </h1>
          <p className="mt-1 text-sm text-[#9A9DA0]">
            Internal workspace for Idyll Productions & clients
          </p>
        </div>

        {/* Auth Mode Toggle */}
        <div className="mb-6 flex rounded-lg bg-[#2E2F34] p-1 border border-[#424344]">
          <button
            type="button"
            onClick={() => {
              setMode("code");
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === "code"
                ? "bg-[#4876F3] text-white shadow"
                : "text-[#9A9DA0] hover:text-white"
            }`}
          >
            Email Code
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === "password"
                ? "bg-[#4876F3] text-white shadow"
                : "text-[#9A9DA0] hover:text-white"
            }`}
          >
            Password
          </button>
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

        {mode === "code" ? (
          !codeSent ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] focus:outline-none focus:ring-2 focus:ring-[#4876F3] disabled:opacity-50 transition-colors"
              >
                {loading ? "Checking email..." : "Send 6-digit code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <div className="rounded-lg bg-[#2E2F34]/50 border border-[#424344] p-3 text-xs text-[#9A9DA0]">
                We sent a 6-digit code to{" "}
                <span className="font-semibold text-white">{email}</span>. Code is valid for 10 minutes.
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                  6-Digit Code
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full tracking-widest text-center text-xl font-bold rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
                />
              </div>

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] focus:outline-none focus:ring-2 focus:ring-[#4876F3] disabled:opacity-50 transition-colors"
              >
                {loading ? "Verifying..." : "Verify & Sign in"}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setCodeSent(false)}
                  className="text-xs text-[#4876F3] hover:underline"
                >
                  Use a different email or re-send code
                </button>
              </div>
            </form>
          )
        ) : (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                Email address
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-medium text-[#9A9DA0]">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-[#4876F3] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] focus:outline-none focus:ring-2 focus:ring-[#4876F3] disabled:opacity-50 transition-colors"
            >
              {loading ? "Signing in..." : "Log in"}
            </button>
          </form>
        )}

        <div className="mt-8 border-t border-[#424344]/50 pt-5 text-center text-xs text-[#747678]">
          Playhead is private. Only team members and invited clients can sign in.
        </div>
      </div>
    </div>
  );
}
