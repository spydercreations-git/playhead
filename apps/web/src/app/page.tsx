"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FolderKanban,
  Clock,
  CalendarDays,
  HardDrive,
  Activity,
  CheckCircle2,
  Video,
  FileText,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

interface HealthStatus {
  status: string;
  database: string;
  redis: string;
  storage: string;
}

export default function DashboardPage() {
  const { data: health, isLoading: healthLoading } = useQuery<HealthStatus>({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await fetch("/api/v1/health");
      if (!res.ok) throw new Error("Health check failed");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const statCards = [
    {
      title: "Active Projects",
      value: "3",
      change: "2 updated today",
      icon: FolderKanban,
      color: "text-blue-500",
    },
    {
      title: "Needs Review",
      value: "4",
      change: "Waiting on client approval",
      icon: Clock,
      color: "text-amber-500",
    },
    {
      title: "Due This Week",
      value: "2",
      change: "1 due tomorrow",
      icon: CalendarDays,
      color: "text-emerald-500",
    },
    {
      title: "Storage Used",
      value: "0 B",
      change: "25 GB limit (Trial)",
      icon: HardDrive,
      color: "text-primary",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            Welcome to Playhead
          </h2>
          <p className="text-sm text-muted-foreground">
            All your video assets, Frame-accurate review, and tracking boards in one workspace.
          </p>
        </div>
      </div>

      {/* Backend & Infrastructure Health Status */}
      <div className="rounded-xl border border-card-border bg-card/60 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Milestone 1 System Connectivity
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            {healthLoading ? (
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : health ? (
              <>
                <span className="flex items-center gap-1.5 font-medium text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> API: {health.status}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  DB: <strong className="text-foreground">{health.database}</strong>
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  Redis: <strong className="text-foreground">{health.redis}</strong>
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">
                  Storage (MinIO): <strong className="text-foreground">{health.storage}</strong>
                </span>
              </>
            ) : (
              <span className="text-amber-400">API health pending startup</span>
            )}
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className="rounded-xl border border-card-border bg-card p-5 shadow-sm hover:border-sidebar-foreground/30 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {stat.title}
              </span>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <div className="mt-3 text-2xl font-bold text-foreground">
              {stat.value}
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      {/* Main Grid: Waiting for review & Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Waiting for Review
            </h3>
            <span className="text-xs text-muted-foreground">0 unresolved files</span>
          </div>

          <EmptyState
            icon={Video}
            title="No files waiting for review"
            description="When team members or clients request changes or upload cuts, they will appear here."
            action={{
              label: "Upload new cut",
              onClick: () => {},
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">
              Recent Activity
            </h3>
            <span className="text-xs text-muted-foreground">Live feed</span>
          </div>

          <EmptyState
            icon={FileText}
            title="Activity is quiet"
            description="Events and comments will appear here in real-time as work happens."
          />
        </div>
      </div>
    </div>
  );
}
