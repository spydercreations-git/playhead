"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthContainer } from "@/components/auth/auth-container";
import { apiRequest, ApiError } from "@/lib/api";

type Screen = "email" | "password" | "code";

export default function LoginPage() {
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codeDigits, setCodeDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triesLeft, setTriesLeft] = useState<number | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [countdown, setCountdown] = useState(42);

  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer for code resend countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (screen === "code" && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [screen, countdown]);

  // Trigger shake animation helper
  function triggerShake(errMsg: string) {
    setError(errMsg);
    setIsShaking(true);
    setTimeout(() => {
      setIsShaking(false);
    }, 500);
  }

  // Handle Send Login Code
  async function handleSendCode(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) return;

    setError(null);
    setLoading(true);

    try {
      await apiRequest("/auth/code/send", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail }),
      });
      setScreen("code");
      setCountdown(42);
      setCodeDigits(["", "", "", "", "", ""]);
      setTimeout(() => {
        codeInputRefs.current[0]?.focus();
      }, 50);
    } catch (err: any) {
      const apiErr = err as ApiError;
      if (apiErr.status === 403 || apiErr.error === "access_denied") {
        setError(
          "This email doesn't have access to Playhead yet. Ask the person who invited you."
        );
      } else {
        setError(apiErr.message || apiErr.error || "Failed to send verification code");
      }
    } finally {
      setLoading(false);
    }
  }

  // Handle Verify 6-digit Code
  async function handleVerifyCode(digitsToVerify?: string[]) {
    const digits = digitsToVerify || codeDigits;
    const code = digits.join("").trim();
    if (code.length !== 6) return;

    setError(null);
    setLoading(true);

    try {
      await apiRequest("/auth/code/verify", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          code,
        }),
      });
      router.push("/");
    } catch (err: any) {
      const apiErr = err as ApiError;
      const newTries = triesLeft !== null ? Math.max(1, triesLeft - 1) : 4;
      setTriesLeft(newTries);
      triggerShake(`That code is not right. ${newTries} tries left.`);
      // Focus first code box
      codeInputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  // Handle Digit Change
  function handleDigitChange(index: number, val: string) {
    // Keep only the last character entered
    const char = val.slice(-1);
    const newDigits = [...codeDigits];
    newDigits[index] = char;
    setCodeDigits(newDigits);
    setError(null);

    // Auto-advance
    if (char && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit on 6th digit
    if (char && index === 5 && newDigits.every((d) => d !== "")) {
      handleVerifyCode(newDigits);
    }
  }

  // Handle Key Down in Code Box
  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (!codeDigits[index] && index > 0) {
        // Move to previous box
        const newDigits = [...codeDigits];
        newDigits[index - 1] = "";
        setCodeDigits(newDigits);
        codeInputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...codeDigits];
        newDigits[index] = "";
        setCodeDigits(newDigits);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }
  }

  // Handle Paste 6 digits
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim().slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...codeDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pastedData[i] || "";
    }
    setCodeDigits(newDigits);
    setError(null);

    const nextIndex = Math.min(pastedData.length, 5);
    codeInputRefs.current[nextIndex]?.focus();

    if (pastedData.length === 6) {
      handleVerifyCode(newDigits);
    }
  }

  // Handle Password Login
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
      if (apiErr.status === 403 || apiErr.error === "access_denied") {
        setError(
          "This email doesn't have access to Playhead yet. Ask the person who invited you."
        );
      } else {
        setError(apiErr.message || "Invalid email or password");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthContainer
      showBack={screen === "code"}
      onBack={() => {
        setScreen("email");
        setError(null);
      }}
    >
      {/* SCREEN: 6-DIGIT CODE */}
      {screen === "code" && (
        <div className="w-full">
          <h1 className="text-[34px] font-bold text-white tracking-tight leading-none mb-3">
            Check your email
          </h1>
          <div className="flex items-center gap-1.5 text-sm text-[#A3A6AD] mb-8">
            <span>We sent a 6 digit code to</span>
            <span className="font-semibold text-white truncate max-w-[200px]">
              {email}
            </span>
            <button
              type="button"
              onClick={() => {
                setScreen("email");
                setError(null);
              }}
              className="text-[#A3A6AD] hover:text-[#4876F3] transition p-0.5 ml-0.5"
              title="Edit email"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>

          {/* 6 Code Boxes */}
          <div
            className={`flex items-center justify-between gap-2.5 sm:gap-3 mb-6 ${
              isShaking ? "animate-shake" : ""
            }`}
          >
            {codeDigits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  codeInputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                onPaste={handlePaste}
                autoFocus={idx === 0}
                className="w-12 h-14 sm:w-14 sm:h-16 rounded-[12px] bg-[#2A2B30] border border-[#2E2F34] text-center text-2xl font-bold text-white focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3] transition-all"
              />
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 rounded-[10px] bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Verify and Sign in Button */}
          <button
            type="button"
            disabled={loading || codeDigits.some((d) => d === "")}
            onClick={() => handleVerifyCode()}
            className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] disabled:opacity-50 disabled:pointer-events-none text-white text-sm font-semibold transition flex items-center justify-center shadow-md mb-6"
          >
            {loading ? "Verifying..." : "Verify and sign in"}
          </button>

          {/* Countdown & Resend */}
          <div className="text-center text-xs text-[#7C7F87] space-y-1">
            <p>
              Didn&apos;t get it? Check spam, or{" "}
              {countdown > 0 ? (
                <span className="text-[#A3A6AD]">
                  resend in 0:{countdown < 10 ? `0${countdown}` : countdown}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSendCode()}
                  className="text-[#4876F3] hover:underline font-medium"
                >
                  resend code
                </button>
              )}
            </p>
            <p className="text-[11px] text-[#7C7F87]">
              The code works for 10 minutes.
            </p>
          </div>
        </div>
      )}

      {/* SCREEN: EMAIL CODE OR PASSWORD */}
      {screen !== "code" && (
        <div className="w-full">
          <h1 className="text-[34px] font-bold text-white tracking-tight leading-none mb-2">
            Sign in to Playhead
          </h1>
          <p className="text-sm text-[#A3A6AD] mb-8">
            Welcome back. Use the email Idyll invited.
          </p>

          {/* Continue with Google Button */}
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1"}/auth/google/url`}
            className="w-full h-[50px] rounded-[10px] bg-white hover:bg-neutral-100 text-[#181818] font-medium text-[15px] transition flex items-center justify-center gap-3 shadow-sm"
          >
            {/* Google Icon */}
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
            <span>Continue with Google</span>
          </a>

          {/* Divider "or" */}
          <div className="relative my-7 flex items-center justify-center">
            <div className="w-full border-t border-[#2A2B30]"></div>
            <span className="absolute bg-[#181818] px-3 text-xs text-[#7C7F87]">
              or
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 rounded-[10px] bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* EMAIL CODE MODE */}
          {screen === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#A3A6AD] mb-2">
                  Work email
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
                    placeholder="harsh@idyllproductions.com"
                    className="w-full h-[48px] rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] pl-10 pr-4 text-sm text-white placeholder-[#7C7F87] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3] transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2 shadow-md"
              >
                <span>{loading ? "Sending code..." : "Email me a sign in code"}</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>

              <div className="pt-1 text-center text-xs text-[#A3A6AD]">
                <span>Team member? </span>
                <button
                  type="button"
                  onClick={() => {
                    setScreen("password");
                    setError(null);
                  }}
                  className="text-[#4876F3] hover:underline font-medium"
                >
                  Sign in with password
                </button>
              </div>
            </form>
          ) : (
            /* PASSWORD MODE */
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#A3A6AD] mb-2">
                  Work email
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
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full h-[48px] rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] pl-10 pr-4 text-sm text-white placeholder-[#7C7F87] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3] transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-[#A3A6AD]">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-[#4876F3] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
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
                    placeholder="••••••••"
                    className="w-full h-[48px] rounded-[10px] bg-[#2A2B30] border border-[#2E2F34] pl-10 pr-4 text-sm text-white placeholder-[#7C7F87] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3] transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center gap-2 shadow-md"
              >
                <span>{loading ? "Signing in..." : "Sign in with password"}</span>
              </button>

              <div className="pt-1 text-center text-xs text-[#A3A6AD]">
                <span>Client or fast login? </span>
                <button
                  type="button"
                  onClick={() => {
                    setScreen("email");
                    setError(null);
                  }}
                  className="text-[#4876F3] hover:underline font-medium"
                >
                  Sign in with email code
                </button>
              </div>
            </form>
          )}

          {/* Note Box with Lock Icon */}
          <div className="mt-8 rounded-[12px] bg-[#212121] border border-[#2E2F34] p-3.5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-[8px] bg-[#2A2B30] flex items-center justify-center text-[#A3A6AD] shrink-0 mt-0.5">
              <svg
                width="15"
                height="15"
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
            <div className="text-xs">
              <p className="font-semibold text-white">Playhead is invite only.</p>
              <p className="text-[#7C7F87] mt-0.5">
                Ask the person who invited you for access.
              </p>
            </div>
          </div>
        </div>
      )}
    </AuthContainer>
  );
}
