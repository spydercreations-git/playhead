"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  Bell,
  Mail,
  Smartphone,
  Check,
  Clock,
  Shield,
  ArrowLeft,
} from "@/components/ui/icon";
import Link from "next/link";

interface PrefRow {
  event_type: string;
  label: string;
  description: string;
  in_app: boolean;
  email: boolean;
}

const DEFAULT_EVENTS: { type: string; label: string; desc: string }[] = [
  {
    type: "shared_with_me",
    label: "Items shared with me",
    desc: "When a collaborator grants you direct access to a folder or file",
  },
  {
    type: "added_to_project",
    label: "Added to project",
    desc: "When you are added to a project or client workspace",
  },
  {
    type: "comment_on_my_file",
    label: "Comments on my files",
    desc: "When someone leaves a comment or feedback on files you uploaded",
  },
  {
    type: "mention",
    label: "Mentions",
    desc: "When someone tags @you in a comment or review thread",
  },
  {
    type: "new_version",
    label: "New file versions",
    desc: "When a collaborator uploads a new revision to an active file",
  },
];

export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState<Record<string, { in_app: boolean; email: boolean }>>({
    shared_with_me: { in_app: true, email: true },
    added_to_project: { in_app: true, email: true },
    comment_on_my_file: { in_app: true, email: true },
    mention: { in_app: true, email: true },
    new_version: { in_app: true, email: false },
  });

  const [frequency, setFrequency] = useState<"instant" | "daily">("instant");
  const [savedToast, setSavedToast] = useState(false);

  // Fetch current preferences
  const { data, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const res = await apiRequest("/notifications/preferences");
      return res.preferences || [];
    },
  });

  useEffect(() => {
    if (data && data.length > 0) {
      const mapped: Record<string, { in_app: boolean; email: boolean }> = { ...preferences };
      data.forEach((p: any) => {
        mapped[p.event_type] = { in_app: p.in_app, email: p.email };
      });
      setPreferences(mapped);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = Object.entries(preferences).map(([eventType, settings]) => ({
        event_type: eventType,
        in_app: settings.in_app,
        email: settings.email,
      }));

      return await apiRequest("/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({ preferences: payload }),
      });
    },
    onSuccess: () => {
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
  });

  function toggleSetting(eventType: string, channel: "in_app" | "email") {
    const current = preferences[eventType] || { in_app: true, email: true };
    const updated = {
      ...preferences,
      [eventType]: {
        ...current,
        [channel]: !current[channel],
      },
    };
    setPreferences(updated);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--border-strong)]/50">
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="p-1.5 rounded-lg hover:bg-[var(--border)] text-[var(--text-2)] hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Notification Preferences</h1>
            <p className="text-xs text-[var(--text-2)] mt-0.5">
              Choose how and when Playhead notifies you about project activity
            </p>
          </div>
        </div>

        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#4876F3] hover:bg-[#3B67E0] disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-all shadow"
        >
          {savedToast ? (
            <>
              <Check className="w-3.5 h-3.5 text-white" />
              <span>Saved</span>
            </>
          ) : (
            <span>{saveMutation.isPending ? "Saving..." : "Save Preferences"}</span>
          )}
        </button>
      </div>

        {/* Content */}
        <div className="p-8 max-w-4xl w-full mx-auto space-y-8">
          {/* Notification Frequency */}
          <div className="bg-[var(--bg)] border border-[var(--panel)] rounded-xl p-6 space-y-4">
            <h2 className="text-xs font-bold  text-[var(--text-2)]">
              Email Frequency
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                onClick={() => setFrequency("instant")}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  frequency === "instant"
                    ? "bg-[#4876F3]/10 border-[#4876F3] text-white"
                    : "bg-[var(--bg)] border-[var(--panel)] text-[var(--text-2)] hover:border-[var(--border-strong)]"
                }`}
              >
                <input
                  type="radio"
                  name="freq"
                  checked={frequency === "instant"}
                  onChange={() => setFrequency("instant")}
                  className="mt-0.5 text-[#4876F3] focus:ring-0"
                />
                <div>
                  <p className="text-xs font-semibold text-white">Send right away</p>
                  <p className="text-xs text-[var(--text-2)] mt-0.5">
                    Receive an email immediately when events occur
                  </p>
                </div>
              </label>

              <label
                onClick={() => setFrequency("daily")}
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  frequency === "daily"
                    ? "bg-[#4876F3]/10 border-[#4876F3] text-white"
                    : "bg-[var(--bg)] border-[var(--panel)] text-[var(--text-2)] hover:border-[var(--border-strong)]"
                }`}
              >
                <input
                  type="radio"
                  name="freq"
                  checked={frequency === "daily"}
                  onChange={() => setFrequency("daily")}
                  className="mt-0.5 text-[#4876F3] focus:ring-0"
                />
                <div>
                  <p className="text-xs font-semibold text-white">Daily summary</p>
                  <p className="text-xs text-[var(--text-2)] mt-0.5">
                    A single digest sent every morning at 9:00 AM
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Events Matrix */}
          <div className="bg-[var(--bg)] border border-[var(--panel)] rounded-xl overflow-hidden">
            <div className="p-6 border-b border-[var(--panel)]">
              <h2 className="text-xs font-bold  text-[var(--text-2)]">
                Activity Alerts
              </h2>
            </div>

            <div className="divide-y divide-[var(--panel)]">
              {DEFAULT_EVENTS.map((evt) => {
                const current = preferences[evt.type] || { in_app: true, email: true };

                return (
                  <div key={evt.type} className="p-5 flex items-center justify-between gap-4">
                    <div className="space-y-0.5 max-w-lg">
                      <p className="text-xs font-medium text-white">{evt.label}</p>
                      <p className="text-xs text-[var(--text-2)]">{evt.desc}</p>
                    </div>

                    <div className="flex items-center gap-6 shrink-0">
                      {/* In-App Toggle */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={current.in_app}
                          onChange={() => toggleSetting(evt.type, "in_app")}
                          className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                        />
                        <span className="text-xs text-[var(--text-2)]">In-app</span>
                      </label>

                      {/* Email Toggle */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={current.email}
                          onChange={() => toggleSetting(evt.type, "email")}
                          className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                        />
                        <span className="text-xs text-[var(--text-2)]">Email</span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
  );
}
