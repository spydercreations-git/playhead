"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayheadLogoWithText } from "@/components/icons";
import { apiRequest, ApiError } from "@/lib/api";
import { Check, X } from "lucide-react";

interface InviteRow {
  email: string;
  role: "admin" | "member" | "guest";
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [user, setUser] = useState<{ id: string; email: string; name: string; email_verified: boolean } | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Step 1: Company details
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);

  // Step 2: Team Invites
  const [invites, setInvites] = useState<InviteRow[]>([
    { email: "", role: "member" },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiRequest("/auth/me")
      .then((data) => {
        if (!mounted) return;
        setUser(data.user);
        if (data.companies && data.companies.length > 0) {
          // If already has a company, set ID and advance to step 2
          setCreatedCompanyId(data.companies[0].id);
          setCompanyName(data.companies[0].name);
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => {
        if (mounted) setLoadingUser(false);
      });

    return () => {
      mounted = false;
    };
  }, [router]);

  function handleNameChange(val: string) {
    setCompanyName(val);
    const generatedSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(generatedSlug);
  }

  async function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const company = await apiRequest("/companies", {
        method: "POST",
        body: JSON.stringify({ name: companyName, slug }),
      });
      setCreatedCompanyId(company.id);
      setStep(2);
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Failed to create company workspace.");
    } finally {
      setLoading(false);
    }
  }

  function addInviteRow() {
    // 1 owner + up to 4 invites = 5 total seats trial limit
    if (invites.length < 4) {
      setInvites([...invites, { email: "", role: "member" }]);
    }
  }

  function removeInviteRow(index: number) {
    setInvites(invites.filter((_, i) => i !== index));
  }

  function updateInviteRow(index: number, field: "email" | "role", value: string) {
    const updated = [...invites];
    updated[index] = { ...updated[index], [field]: value };
    setInvites(updated);
  }

  async function handleStep2Submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (createdCompanyId) {
        const validInvites = invites.filter((inv) => inv.email.trim().length > 0);
        for (const inv of validInvites) {
          await apiRequest(`/companies/${createdCompanyId}/invites`, {
            method: "POST",
            body: JSON.stringify({ email: inv.email.trim(), role: inv.role }),
          });
        }
      }
      router.push("/");
    } catch (err: any) {
      const apiErr = err as ApiError;
      setError(apiErr.error || "Failed to send team invites. You can invite team members later from the Team tab.");
    } finally {
      setLoading(false);
    }
  }

  if (loadingUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#181818]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#4876F3] border-t-transparent" />
      </div>
    );
  }

  if (user && !user.email_verified) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 bg-[#181818]">
        <div className="mb-8 flex justify-center">
          <PlayheadLogoWithText width={170} color="#FFFFFF" />
        </div>
        <div className="w-full max-w-[460px] rounded-2xl border border-[#424344] bg-[#212121] p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Email verification required</h2>
          <p className="text-sm text-[#9A9DA0] mb-6">
            Please verify your email address (<span className="text-white font-medium">{user.email}</span>) before setting up your company workspace.
          </p>
          <div className="rounded-lg border border-[#424344] bg-[#2E2F34] p-3 text-xs text-[#9A9DA0] mb-6">
            In local development, check Mailpit for the activation link at{" "}
            <a
              href="http://localhost:8025"
              target="_blank"
              rel="noreferrer"
              className="text-[#4876F3] underline hover:text-[#688ff8]"
            >
              http://localhost:8025
            </a>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white hover:bg-[#3b66df] transition-colors mb-3"
          >
            I verified my email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 bg-[#181818]">
      <div className="mb-8 flex justify-center">
        <PlayheadLogoWithText width={170} color="#FFFFFF" />
      </div>

      <div className="w-full max-w-[520px] rounded-2xl border border-[#424344] bg-[#212121] p-8 shadow-2xl">
        {/* Progress Tracker */}
        <div className="mb-8 flex items-center justify-between border-b border-[#424344] pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === 1 ? "bg-[#4876F3] text-white" : "bg-emerald-500 text-white"
              }`}
            >
              {step > 1 ? <Check className="w-3.5 h-3.5" /> : "1"}
            </div>
            <span className={`text-xs font-semibold ${step === 1 ? "text-white" : "text-[#9A9DA0]"}`}>
              Workspace
            </span>
          </div>

          <div className="h-0.5 flex-1 mx-4 bg-[#424344]" />

          <div className="flex items-center gap-3">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step === 2 ? "bg-[#4876F3] text-white" : "bg-[#2E2F34] text-[#9A9DA0]"
              }`}
            >
              2
            </div>
            <span className={`text-xs font-semibold ${step === 2 ? "text-white" : "text-[#9A9DA0]"}`}>
              Team (Trial 5 seats)
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-5">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Create your workspace</h1>
              <p className="mt-1 text-xs text-[#9A9DA0]">
                A shared home for your video projects, reviews, boards, and files.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                Company or agency name
              </label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Idyll Productions"
                className="w-full rounded-lg border border-[#424344] bg-[#2E2F34] px-3.5 py-2.5 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none focus:ring-1 focus:ring-[#4876F3]"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-[#9A9DA0]">
                Workspace URL slug
              </label>
              <div className="flex rounded-lg border border-[#424344] bg-[#2E2F34] overflow-hidden focus-within:border-[#4876F3] focus-within:ring-1 focus-within:ring-[#4876F3]">
                <span className="flex items-center px-3 text-xs text-[#686B6E] border-r border-[#424344] select-none">
                  app.playhead.io/
                </span>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="idyll-productions"
                  className="w-full bg-transparent px-3 py-2.5 text-sm text-white placeholder-[#686B6E] focus:outline-none"
                />
              </div>
            </div>

            <div className="rounded-lg border border-[#424344] bg-[#2E2F34]/50 p-3 text-xs text-[#9A9DA0]">
              <span className="font-semibold text-white">14-day free trial active:</span> Full agency access including 1 TB cloud storage and up to 5 team member seats.
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] focus:outline-none focus:ring-2 focus:ring-[#4876F3] disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating workspace..." : "Continue to team setup"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="space-y-5">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Invite your team</h1>
              <p className="mt-1 text-xs text-[#9A9DA0]">
                Add editors, producers, or clients. Your 14-day trial includes up to 5 team seats (1 owner + 4 members).
              </p>
            </div>

            <div className="space-y-3">
              {invites.map((inv, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={inv.email}
                    onChange={(e) => updateInviteRow(idx, "email", e.target.value)}
                    placeholder="teammate@company.com"
                    className="flex-1 rounded-lg border border-[#424344] bg-[#2E2F34] px-3 py-2 text-sm text-white placeholder-[#686B6E] focus:border-[#4876F3] focus:outline-none"
                  />
                  <select
                    value={inv.role}
                    onChange={(e) => updateInviteRow(idx, "role", e.target.value as any)}
                    className="rounded-lg border border-[#424344] bg-[#2E2F34] px-2.5 py-2 text-xs text-white focus:border-[#4876F3] focus:outline-none"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="guest">Guest</option>
                  </select>
                  {invites.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInviteRow(idx)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-[#9A9DA0] hover:bg-[#2E2F34] hover:text-white"
                      title="Remove row"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {invites.length < 4 && (
              <button
                type="button"
                onClick={addInviteRow}
                className="text-xs font-semibold text-[#4876F3] hover:underline"
              >
                + Add another teammate ({4 - invites.length} seats remaining in trial)
              </button>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg bg-[#4876F3] py-2.5 text-sm font-semibold text-white shadow hover:bg-[#3b66df] focus:outline-none focus:ring-2 focus:ring-[#4876F3] disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending..." : "Send invites & Finish"}
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-lg border border-[#424344] bg-[#2E2F34] px-4 py-2.5 text-sm font-semibold text-[#9A9DA0] hover:bg-[#383a42] hover:text-white transition-colors"
              >
                Skip for now
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
