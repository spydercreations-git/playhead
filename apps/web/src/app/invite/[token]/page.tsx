"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthContainer } from "@/components/auth/auth-container";
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
        setError(apiErr.message || apiErr.error || "This invitation is invalid or has expired.");
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
      setError(apiErr.message || apiErr.error || "Unable to accept invite.");
      setAccepting(false);
    }
  }

  async function handleLogoutAndSwitch() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // Ignore
    }
    router.push(`/login?email=${encodeURIComponent(invite?.email || "")}`);
  }

  return (
    <AuthContainer>
      <div className="w-full">
        {loading ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#4876F3] border-t-transparent" />
            <p className="text-sm text-[var(--text-2)]">Loading invitation...</p>
          </div>
        ) : error ? (
          <div>
            <h1 className="text-[28px] font-bold text-white tracking-tight leading-none mb-3">
              Invitation invalid
            </h1>
            <p className="text-sm text-[var(--text-2)] mb-8">{error}</p>
            <Link
              href="/login"
              className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] text-white text-sm font-semibold transition flex items-center justify-center shadow-md mb-6"
            >
              Back to sign in
            </Link>
          </div>
        ) : invite ? (
          <div>
            <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight mb-2">
              Join {invite.company_name}
            </h1>
            <p className="text-sm text-[var(--text-2)] mb-8">
              You were invited as a <span className="font-semibold text-white capitalize">{invite.role}</span>.
            </p>

            {!currentUser ? (
              <div className="space-y-4">
                <div className="rounded-[12px] bg-[var(--panel)] border border-[var(--border)] p-3.5 text-xs text-[var(--text-2)] leading-relaxed">
                  This invitation was sent to <span className="text-white font-medium">{invite.email}</span>. To accept, sign in with this exact email address.
                </div>
                <Link
                  href={`/login?email=${encodeURIComponent(invite.email)}`}
                  className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] text-white text-sm font-semibold transition flex items-center justify-center shadow-md"
                >
                  Continue with {invite.email}
                </Link>
              </div>
            ) : currentUser.email.toLowerCase() === invite.email.toLowerCase() ? (
              <div className="space-y-4">
                <div className="rounded-[12px] bg-[var(--panel)] border border-[var(--border)] p-3.5 text-xs text-[var(--text-2)]">
                  Signed in as <span className="text-white font-medium">{currentUser.email}</span>
                </div>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={accepting}
                  className="w-full h-[48px] rounded-[10px] bg-[#3B67E0] hover:bg-[#4876F3] disabled:opacity-50 text-white text-sm font-semibold transition flex items-center justify-center shadow-md"
                >
                  {accepting ? "Joining workspace..." : "Accept & join workspace"}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[12px] bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-300">
                  You are currently signed in as <span className="font-semibold">{currentUser.email}</span>, but this invitation was sent to <span className="font-semibold">{invite.email}</span>.
                </div>
                <button
                  type="button"
                  onClick={handleLogoutAndSwitch}
                  className="w-full h-[48px] rounded-[10px] bg-[var(--input)] hover:bg-[var(--border)] text-white text-sm font-semibold transition flex items-center justify-center"
                >
                  Switch account to {invite.email}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </AuthContainer>
  );
}
