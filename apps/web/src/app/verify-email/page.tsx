"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlayheadLogoWithText } from "@/components/icons";
import { apiRequest, ApiError } from "@/lib/api";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    token ? "loading" : "error"
  );
  const [errorMessage, setErrorMessage] = useState(
    token ? "" : "No verification token found in URL."
  );

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    apiRequest("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        if (mounted) {
          setStatus("success");
        }
      })
      .catch((err: any) => {
        if (mounted) {
          const apiErr = err as ApiError;
          setStatus("error");
          setErrorMessage(
            apiErr.error || "The verification link is invalid or has expired."
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 bg-[#181818]">
      <div className="mb-8 flex justify-center">
        <Link href="/">
          <PlayheadLogoWithText width={170} color="#FFFFFF" />
        </Link>
      </div>

      <div className="w-full max-w-[420px] rounded-xl border border-[#424344] bg-[#212121] p-8 text-center shadow-overlay">
        {status === "loading" && (
          <div className="py-6">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#4876F3] border-t-transparent" />
            <h2 className="text-lg font-bold text-white mb-1">Verifying your email</h2>
            <p className="text-sm text-[#A3A6AD]">Please wait a moment...</p>
          </div>
        )}

        {status === "success" && (
          <div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Email verified</h2>
            <p className="text-sm text-[#A3A6AD] mb-6">
              Your email has been confirmed. You can now set up your company workspace and start your 14-day trial.
            </p>
            <Link
              href="/onboarding"
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#4876F3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3B67E0] transition-colors"
            >
              Continue to workspace setup
            </Link>
          </div>
        )}

        {status === "error" && (
          <div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Verification failed</h2>
            <p className="text-sm text-[#A3A6AD] mb-6">{errorMessage}</p>
            <div className="flex flex-col gap-3">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#4876F3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3B67E0] transition-colors"
              >
                Sign up again
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#2E2F34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2E2F34] transition-colors"
              >
                Log in
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#181818]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#4876F3] border-t-transparent" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
