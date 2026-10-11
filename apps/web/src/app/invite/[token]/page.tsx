"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayheadLogoWithText } from "@/components/icons";
import { apiRequest, ApiError } from "@/lib/api";

interface InviteData {
  id: string;
  email: string;
  role: string;
  company_id: string;
  company_name: string;
  expires_at: string;
}

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();

  const [invite, setInvite] = useState<InviteData | null>(null);
  const [currentUser, setCurrentUser] = useState<{ email: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const inv = await apiRequest(`/invites/${token}`);
        if (!mounted) return;
        setInvite(inv);

        try {
          const me = await apiRequest("/auth/me");
          if (mounted && me.user) {
            setCurrentUser(me.user);
          }
        } catch {
          // User is not logged in yet
        }
      } catch (err: any) {
        if (!mounted) return;
        const apiErr = err as ApiError;
        setError(apiErr.error || "This invitation is invalid or has expired.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    setError(null);

    try {
      await apiRequest(`/invites/${token}/accept`, {
        method: "POST",
      });
      router.push("/");
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Unable to accept invite.");
      setAccepting(false);
    }
  }

  async function handleLogoutAndSwitch() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    router.push(`/login?redirect=/invite/${token}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 bg-[#181818]">
      <div className="mb-8 flex justify-center">
        <Link href="/">
          <PlayheadLogoWithText width={170} color="#FFFFFF" />
        </Link>
      </div>

      <div className="w-full max-w-[460px] rounded-2xl border border-[#424344] bg-[#212121] p-8 text-center shadow-2xl">
        {loading ? (
          <div className="py-8">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#4876F3] border-t-transparent" />
            <p className="text-sm text-[#9A9DA0]">Loading invitation...</p>
          </div>
        ) : error ? (
          <div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20 text-red-400">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Invitation unavailable</h2>
            <p className="text-sm text-[#9A9DA0] mb-6">{error}</p>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#2E2F34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#383a42] transition-colors"
            >
              Go to login
            </Link>
          </div>
        ) : invite ? (
          <div>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#4876F3]/20 text-[#4876F3]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </div>

            <h1 className="text-xl font-bold text-white mb-1">
              Join {invite.company_name}
            </h1>
            <p className="text-xs text-[#9A9DA0] mb-6">
              You were invited as a <span className="font-semibold text-white uppercase">{invite.role}</span>.
            </p>

            {!currentUser ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-[#424344] bg-[#2E2F34] p-4 text-xs text-[#9A9DA0] text-left">
                  This invitation was sent to <span className="text-white font-medium">{invite.email}</span>. To accept, sign in or create an account with this exact email address.
                </div>
                <div className="flex flex-col gap-2.5">
                  <Link
                    href={`/login?email=${encodeURIComponent(invite.email)}`}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-[#4876F3] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3b66df] transition-colors"
                  >
                    Log in with {invite.email}
                  </Link>
                  <Link
                    href={`/signup?email=${encodeURIComponent(invite.email)}`}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-[#2E2F34] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#383a42] transition-colors"
                  >
                    Create account
                  </Link>
                </div>
              </div>
            ) : currentUser.email.toLowerCase() === invite.email.toLowerCase() ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-[#424344] bg-[#2E2F34] p-3 text-xs text-[#9A9DA0]">
                  Logged in as <span className="text-white font-medium">{currentUser.email}</span>
                </div>
                <button
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] disabled:opacity-50 transition-colors"
                >
                  {accepting ? "Joining workspace..." : "Accept & join workspace"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-300 text-left">
                  You are currently logged in as <span className="font-semibold">{currentUser.email}</span>, but this invitation was sent to <span className="font-semibold">{invite.email}</span>.
                </div>
                <button
                  onClick={handleLogoutAndSwitch}
                  className="w-full rounded-lg bg-[#2E2F34] py-2.5 text-sm font-semibold text-white hover:bg-[#383a42] transition-colors"
                >
                  Switch account to {invite.email}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
