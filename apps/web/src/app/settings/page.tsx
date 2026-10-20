"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";
import { Settings as SettingsIcon, Bell, Database, Building2, User, Shield } from "@/components/ui/icon";

export default function SettingsPage() {
  const { user, company, role, hasPermission, isClient } = useAuth();

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white mb-1">
          Settings
        </h1>
        <p className="text-xs text-[var(--text-2)]">
          Manage your account preferences, notifications, and workspace settings.
        </p>
      </div>

      {/* User Account Card */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--button)] text-sm font-bold text-[var(--button-text)] shadow-sm">
            {user?.name ? user.name.slice(0, 2).toUpperCase() : "PH"}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">
              {user?.name || user?.email || "User"}
            </h2>
            <p className="text-xs text-[var(--text-3)]">{user?.email}</p>
            {role && (
              <span className="inline-block mt-1.5 rounded-[6px] bg-[var(--accent)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--accent)] border border-[var(--accent)]/30 capitalize">
                {role}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Settings Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/settings/notifications"
          className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 hover:border-[var(--accent)] hover:bg-[var(--hover)] transition-all group"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--input)] text-white group-hover:text-[var(--accent)] transition-colors">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white group-hover:text-[var(--accent)] transition-colors mb-1">
              Notification Preferences
            </h3>
            <p className="text-xs text-[var(--text-2)]">
              Configure email digests, project alerts, and mention notifications.
            </p>
          </div>
        </Link>

        {hasPermission("admin.storage") && (
          <Link
            href="/settings/storage"
            className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 hover:border-[var(--accent)] hover:bg-[var(--hover)] transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--input)] text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white group-hover:text-[var(--accent)] transition-colors mb-1">
                Storage & Quota
              </h3>
              <p className="text-xs text-[var(--text-2)]">
                View storage utilization, project usage breakdowns, and quota alerts.
              </p>
            </div>
          </Link>
        )}

        {(hasPermission("team.invite") || hasPermission("team.manage_roles")) && (
          <Link
            href="/team"
            className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 hover:border-[var(--accent)] hover:bg-[var(--hover)] transition-all group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--input)] text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white group-hover:text-[var(--accent)] transition-colors mb-1">
                Team & Access Roles
              </h3>
              <p className="text-xs text-[var(--text-2)]">
                Invite teammates, configure custom roles, and assign permissions.
              </p>
            </div>
          </Link>
        )}

        {company && (
          <div className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--input)] text-[var(--text-3)]">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">
                {company.name}
              </h3>
              <p className="text-xs text-[var(--text-2)]">
                Plan: <span className="capitalize font-medium text-white">{company.plan}</span> · Status: <span className="capitalize text-green-400">{company.status}</span>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
