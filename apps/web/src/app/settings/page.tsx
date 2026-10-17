"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";
import { useTheme } from "@/lib/theme";
import { Settings as SettingsIcon, Bell, Database, Building2, User, Shield, Palette } from "@/components/ui/icon";
import { ThemePickerDialog } from "@/components/settings/theme-picker-dialog";
import { THEMES } from "@/components/settings/theme-preview";

export default function SettingsPage() {
  const { user, company, role, hasPermission, isClient } = useAuth();
  const { theme, isAppearanceOpen, openAppearance, closeAppearance } = useTheme();

  const currentTheme = THEMES.find((t) => t.id === theme) || THEMES[0];

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
        {/* Appearance Theme Picker Card */}
        <button
          type="button"
          onClick={openAppearance}
          className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 hover:border-[var(--accent)] hover:bg-[var(--hover)] transition-all text-left cursor-pointer group"
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
              borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
              color: "var(--accent)",
            }}
          >
            <Palette className="w-5 h-5 text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="text-sm font-semibold text-white group-hover:text-[var(--accent)] transition-colors">
                Appearance
              </h3>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border transition-all capitalize"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--accent) 15%, transparent)",
                  borderColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
                  color: "var(--accent)",
                }}
              >
                <span className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: "var(--accent)" }} />
                <span>{currentTheme.name}</span>
              </span>
            </div>
            <p className="text-xs text-[var(--text-2)]">
              Pick a colour for your Playhead. Only you see it. Clients always see Blue.
            </p>
          </div>
        </button>

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

      <ThemePickerDialog isOpen={isAppearanceOpen} onClose={closeAppearance} />
    </div>
  );
}
