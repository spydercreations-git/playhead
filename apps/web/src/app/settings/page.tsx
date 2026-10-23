"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/use-auth";
import {
  Settings as SettingsIcon,
  Bell,
  Database,
  Building2,
  User,
  Shield,
  Globe,
  Check,
} from "@/components/ui/icon";
import {
  useUserTimezone,
  getTimezoneOffsetString,
  getTimezoneAbbr,
  formatTimezoneBadge,
} from "@/lib/timezone";
import { TimezoneSelect } from "@/components/ui/timezone-select";

export default function SettingsPage() {
  const { user, company, role, hasPermission, isClient } = useAuth();
  const {
    preference,
    effectiveTimezone,
    detectedTimezone,
    isAutodetect,
    setTimezone,
  } = useUserTimezone();

  const [savedFeedback, setSavedFeedback] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState("");

  const activeOffset = getTimezoneOffsetString(effectiveTimezone);
  const activeAbbr = getTimezoneAbbr(effectiveTimezone);

  useEffect(() => {
    function updateClock() {
      try {
        const str = new Intl.DateTimeFormat("en-US", {
          timeZone: effectiveTimezone,
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          weekday: "short",
          month: "short",
          day: "numeric",
        }).format(new Date());
        setCurrentTimeStr(str);
      } catch {
        setCurrentTimeStr("");
      }
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [effectiveTimezone]);

  function handleTimezoneChange(newTz: string) {
    setTimezone(newTz);
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
    }, 2500);
  }

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

      {/* Timezone & Regional Preferences Card */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--input)] text-[#4876F3]">
              <Globe className="w-5 h-5 text-[#4876F3]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                Timezone & Regional Preferences
              </h2>
              <p className="text-xs text-[var(--text-2)]">
                Choose your local timezone for deadlines, task scheduling, and activity timestamps.
              </p>
            </div>
          </div>
          {savedFeedback && (
            <span className="flex items-center gap-1.5 text-[13px] text-[#3fcf8e] bg-[#3fcf8e]/10 border border-[#3fcf8e]/20 px-3 py-1 rounded-full font-medium shrink-0 animate-in fade-in duration-200">
              <Check size={14} className="text-[#3fcf8e]" />
              <span>Saved</span>
            </span>
          )}
        </div>

        <div className="max-w-md pt-1">
          <TimezoneSelect
            value={preference}
            onChange={handleTimezoneChange}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[var(--text-3)] pt-2 border-t border-[var(--border)]">
          <div>
            System detected:{" "}
            <span className="text-white font-medium">{detectedTimezone}</span>
          </div>
          <div>
            Active offset:{" "}
            <span className="text-white font-medium">
              {formatTimezoneBadge(effectiveTimezone)}
            </span>
          </div>
          {currentTimeStr && (
            <div>
              Current time:{" "}
              <span className="text-white font-medium">{currentTimeStr}</span>
            </div>
          )}
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
