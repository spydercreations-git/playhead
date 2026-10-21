"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/use-auth";
import { apiRequest } from "@/lib/api";
import {
  Upload,
  ChatBubble,
  CheckCircle2,
  Lock,
  MoreHorizontal,
  ChevronRight,
  ClipboardList,
  Folder,
  VideoFileIcon,
  UserPlus,
  Loader2,
  X,
} from "@/components/ui/icon";
import { UploadDestinationDialog } from "@/components/uploads/upload-destination-dialog";

interface WaitingReviewItem {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  client_name: string;
  review_status: string;
  version_number: number;
  duration_ms: number;
  comment_count: number;
  thumbnail_url?: string;
}

interface HomeProjectItem {
  id: string;
  name: string;
  client_id?: string;
  client_name?: string;
  file_count?: number;
  waiting_review_count?: number;
  thumbnails?: string[];
  members?: { id?: string; email?: string; name?: string; color?: string }[];
  updated_at?: string;
}

interface ActivityEventItem {
  id: string;
  actor_name: string;
  actor_avatar?: string;
  event_type: string;
  target_type: string;
  target_id: string;
  project_id?: string;
  client_id?: string;
  created_at: string;
  metadata?: {
    action_text?: string;
    item_name?: string;
    project_name?: string;
    client_name?: string;
    item_url?: string;
    version?: string;
    comment_time?: string;
  };
}

interface HomeDashboardData {
  greeting_name: string;
  waiting_review_count: number;
  waiting_review_items: WaitingReviewItem[];
  projects: HomeProjectItem[];
  recent_activity: ActivityEventItem[];
  last_upload_project_id?: string;
  last_upload_folder_id?: string;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} h ago`;
  if (diffSec < 172800) return "Yesterday";
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const AVATAR_COLORS = [
  "#64b5f6", // blue
  "#81c784", // green
  "#9575cd", // purple
  "#f06292", // pink
  "#ffb74d", // amber
  "#7986cb", // indigo
  "#4dd6ac", // teal
  "#e57373", // red
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function HomePage() {
  const router = useRouter();
  const { user, isClient } = useAuth();
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showAllActivityModal, setShowAllActivityModal] = useState(false);

  // Fetch Home Dashboard data
  const { data: homeData, isLoading } = useQuery<HomeDashboardData>({
    queryKey: ["home-dashboard"],
    queryFn: () => apiRequest<HomeDashboardData>("/home"),
    staleTime: 15_000,
    enabled: !!user,
  });

  // Fetch Paginated Activity for "See all activity" modal
  const { data: allActivityData, isLoading: activityLoading } = useQuery<{
    events: ActivityEventItem[];
    total_count: number;
  }>({
    queryKey: ["all-activity"],
    queryFn: () => apiRequest<{ events: ActivityEventItem[]; total_count: number }>("/home/activity?limit=50"),
    enabled: showAllActivityModal,
  });

  const greetingName = useMemo(() => {
    if (homeData?.greeting_name) return homeData.greeting_name;
    if (user?.name) return user.name.split(" ")[0];
    return "Harsh";
  }, [homeData, user]);

  const waitingReviewItems = homeData?.waiting_review_items || [];
  const waitingReviewCount = homeData?.waiting_review_count ?? waitingReviewItems.length;
  const projects = homeData?.projects || [];
  const recentActivity = homeData?.recent_activity || [];

  return (
    <div className="flex-1 w-full min-h-screen bg-[var(--bg)] text-white p-6 md:p-8 space-y-8 select-none">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {getTimeGreeting()}, {greetingName}
          </h1>
          <p className="text-xs text-[var(--text-3)] mt-1">
            {waitingReviewCount === 1
              ? "1 file is waiting for your review."
              : `${waitingReviewCount} files are waiting for your review.`}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/tasks?new=1")}
            className="flex items-center gap-2 h-9 px-4 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--hover)] text-xs font-medium text-white transition-colors"
          >
            <ClipboardList size={16} className="text-[var(--text-2)]" />
            <span>Assign new task</span>
          </button>

          <button
            onClick={() => setShowUploadDialog(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-[10px] bg-[var(--button)] hover:bg-[var(--button-hover)] text-xs font-semibold text-white transition-colors shadow-sm"
          >
            <Upload size={16} />
            <span>Upload</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left Column (Review + Projects) & Right Column (Recent Activity) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (8 cols) */}
        <div className="lg:col-span-8 space-y-8 min-w-0">
          {/* Section 1: Waiting for review */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-white">Waiting for review</h2>
                {waitingReviewCount > 0 && (
                  <span className="text-xs font-medium text-[var(--text-3)] tabular-nums">
                    {waitingReviewCount}
                  </span>
                )}
              </div>
              <Link
                href="/library?filter=review"
                className="text-xs font-medium text-[var(--text-3)] hover:text-white transition-colors"
              >
                See all
              </Link>
            </div>

            {waitingReviewItems.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-xs text-[var(--text-3)]">
                No files currently waiting for review. You&apos;re all caught up!
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {waitingReviewItems.map((item) => {
                  const isChangesRequested = item.review_status === "changes_requested";
                  const statusLabel = isChangesRequested ? "Changes requested" : "Needs review";
                  const statusBg = isChangesRequested
                    ? "bg-[#F0506E]/15 text-[#F0506E] border-[#F0506E]/20"
                    : "bg-[#FFD43B]/15 text-[#FFD43B] border-[#FFD43B]/20";

                  return (
                    <div
                      key={item.id}
                      onClick={() =>
                        router.push(`/library/projects/${item.project_id}/items/${item.id}/review`)
                      }
                      className="group rounded-xl border border-[var(--border)] bg-[var(--panel)] overflow-hidden cursor-pointer hover:border-[var(--border-strong)] transition-all hover:scale-[1.01]"
                    >
                      {/* Video Thumbnail Box */}
                      <div className="relative aspect-[16/10] bg-[var(--input)] overflow-hidden flex items-center justify-center">
                        {item.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumbnail_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-[var(--panel-raised)] flex items-center justify-center">
                            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/40">
                              <VideoFileIcon size={20} />
                            </div>
                          </div>
                        )}

                        {/* Top Right Comment Badge */}
                        {item.comment_count > 0 && (
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-xs font-medium text-white border border-white/10">
                            <ChatBubble size={11} className="text-white/80" />
                            <span className="tabular-nums">{item.comment_count}</span>
                          </div>
                        )}

                        {/* Bottom Left Version Tag */}
                        <div className="absolute bottom-2.5 left-2.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-xs font-medium text-white border border-white/10 tabular-nums">
                          v{item.version_number || 1}
                        </div>

                        {/* Bottom Right Duration */}
                        <div className="absolute bottom-2.5 right-2.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-xs font-medium text-white border border-white/10 tabular-nums">
                          {formatDuration(item.duration_ms)}
                        </div>
                      </div>

                      {/* Card Info */}
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate group-hover:text-[#4876F3] transition-colors">
                            {item.name}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="text-[var(--text-3)] hover:text-white p-0.5"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        </div>
                        <p className="text-xs text-[var(--text-3)] truncate mt-0.5">
                          {item.client_name ? `${item.client_name} · ` : ""}
                          v{item.version_number || 1}
                        </p>

                        {/* Status Tag */}
                        <div className="mt-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${statusBg}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            <span>{statusLabel}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Your projects */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Your projects</h2>
              <Link
                href="/library"
                className="text-xs font-medium text-[var(--text-3)] hover:text-white transition-colors"
              >
                All projects
              </Link>
            </div>

            {projects.length === 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center text-xs text-[var(--text-3)]">
                No active projects found. Create a project to start collaborating.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {projects.map((proj) => {
                  const clientLetter = (proj.client_name || proj.name).charAt(0).toUpperCase();
                  const clientColor = getAvatarColor(proj.client_name || proj.name);

                  return (
                    <div
                      key={proj.id}
                      onClick={() => router.push(`/library/projects/${proj.id}`)}
                      className="group rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 cursor-pointer hover:border-[var(--border-strong)] transition-all hover:scale-[1.01]"
                    >
                      {/* Project Mosaic Header (4 preview tiles) */}
                      <div className="aspect-[16/9] rounded-lg bg-[var(--input)] overflow-hidden grid grid-cols-3 gap-1 p-1 mb-3">
                        <div className="col-span-2 rounded bg-[var(--panel-raised)] flex items-center justify-center overflow-hidden">
                          {proj.thumbnails && proj.thumbnails[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={proj.thumbnails[0]}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/30">
                              <Folder size={18} />
                            </div>
                          )}
                        </div>
                        <div className="col-span-1 grid grid-rows-2 gap-1">
                          <div className="rounded bg-[var(--panel)] overflow-hidden flex items-center justify-center text-white/20 text-xs">
                            {proj.thumbnails && proj.thumbnails[1] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={proj.thumbnails[1]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span></span>
                            )}
                          </div>
                          <div className="rounded bg-[var(--panel)] overflow-hidden flex items-center justify-center text-white/20 text-xs">
                            {proj.thumbnails && proj.thumbnails[2] ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={proj.thumbnails[2]} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span></span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Project Title & Client Subtitle */}
                      <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#4876F3] transition-colors">
                        {proj.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-[var(--text-3)] truncate">
                        <span
                          className="w-3.5 h-3.5 rounded flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ backgroundColor: clientColor }}
                        >
                          {clientLetter}
                        </span>
                        <span className="truncate">{proj.client_name || "Idyll Productions"}</span>
                        <span>·</span>
                        <span className="tabular-nums">{proj.file_count || 0} files</span>
                        {proj.updated_at && (
                          <>
                            <span>·</span>
                            <span>opened {formatRelativeTime(proj.updated_at)}</span>
                          </>
                        )}
                      </div>

                      {/* Bottom row: Avatar stack + Review pill */}
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[var(--border)]/50">
                        {/* Member avatar stack */}
                        <div className="flex items-center -space-x-1.5 overflow-hidden">
                          {(proj.members && proj.members.length > 0
                            ? proj.members.slice(0, 3)
                            : [{ name: "Harsh" }]
                          ).map((m, idx) => {
                            const initial = (m.name || "U").charAt(0).toUpperCase();
                            return (
                              <div
                                key={idx}
                                className="w-5 h-5 rounded-full border border-[var(--panel)] flex items-center justify-center text-xs font-bold text-white"
                                style={{ backgroundColor: getAvatarColor(m.name || initial) }}
                              >
                                {initial}
                              </div>
                            );
                          })}
                        </div>

                        {/* Review pill */}
                        {proj.waiting_review_count && proj.waiting_review_count > 0 ? (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#FFD43B]/15 text-[#FFD43B] text-xs font-medium border border-[#FFD43B]/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FFD43B]" />
                            <span className="tabular-nums">
                              {proj.waiting_review_count} to review
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="text-[var(--text-3)] hover:text-white p-0.5"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Private Workspace Notice (Staff & Editors only - Requirement 5) */}
          {!isClient && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 text-xs text-[var(--text-3)]">
              <Lock size={16} className="text-[var(--text-2)] shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-white">
                  Playhead is Idyll Productions&apos; private workspace for client work.
                </p>
                <p className="text-[var(--text-3)] mt-0.5">
                  Please don&apos;t use it for personal files.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Recent Activity (4 cols) */}
        <div className="lg:col-span-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Recent activity</h2>
          </div>

          {recentActivity.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-3)]">
              No recent activity in your workspace yet.
            </div>
          ) : (
            <div className="space-y-4">
              {recentActivity.slice(0, 11).map((ev) => {
                const initial = (ev.actor_name || "U").charAt(0).toUpperCase();
                const avatarBg = getAvatarColor(ev.actor_name || "User");
                const actionText = ev.metadata?.action_text || ev.event_type.replace(/_/g, " ");
                const itemSubtitle =
                  ev.metadata?.item_name ||
                  (ev.metadata?.project_name ? `${ev.metadata.project_name}` : "");
                const clientPrefix = ev.metadata?.client_name ? `${ev.metadata.client_name} · ` : "";

                return (
                  <div key={ev.id} className="flex items-start gap-3 text-xs min-w-0">
                    {/* Actor Initial Avatar */}
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
                      style={{ backgroundColor: avatarBg }}
                    >
                      {initial}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-white truncate">
                          <span className="font-semibold text-white">{ev.actor_name}</span>{" "}
                          <span className="text-[var(--text-2)]">{actionText}</span>
                        </p>
                        <span className="text-xs text-[var(--text-3)] shrink-0 tabular-nums">
                          {formatRelativeTime(ev.created_at)}
                        </span>
                      </div>

                      {/* Linked Item Subtitle */}
                      {itemSubtitle && (
                        <div
                          onClick={() => {
                            if (ev.metadata?.item_url) {
                              router.push(ev.metadata.item_url);
                            }
                          }}
                          className="flex items-center gap-1 text-xs text-[var(--text-3)] hover:text-white truncate cursor-pointer mt-0.5 transition-colors"
                        >
                          <span className="truncate">
                            {clientPrefix}
                            {itemSubtitle}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* See all activity link */}
              <div className="pt-3 border-t border-[var(--border)] text-center">
                <button
                  onClick={() => setShowAllActivityModal(true)}
                  className="text-xs font-semibold text-[#4876F3] hover:underline"
                >
                  See all activity
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Destination Modal */}
      <UploadDestinationDialog
        isOpen={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        initialProjectId={homeData?.last_upload_project_id}
        initialFolderId={homeData?.last_upload_folder_id}
      />

      {/* See All Activity Modal */}
      {showAllActivityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="fixed inset-0"
            onClick={() => setShowAllActivityModal(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--panel-raised)] shadow-[0_16px_36px_rgba(0,0,0,0.6)] overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
              <h2 className="text-base font-semibold text-white">All workspace activity</h2>
              <button
                onClick={() => setShowAllActivityModal(false)}
                className="p-1 rounded-lg text-[var(--text-3)] hover:text-white hover:bg-[var(--hover)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5 space-y-4">
              {activityLoading ? (
                <div className="py-8 flex justify-center text-[var(--text-3)]">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : allActivityData?.events && allActivityData.events.length > 0 ? (
                allActivityData.events.map((ev) => {
                  const initial = (ev.actor_name || "U").charAt(0).toUpperCase();
                  const avatarBg = getAvatarColor(ev.actor_name || "User");
                  const actionText = ev.metadata?.action_text || ev.event_type.replace(/_/g, " ");
                  const itemSubtitle =
                    ev.metadata?.item_name ||
                    (ev.metadata?.project_name ? `${ev.metadata.project_name}` : "");
                  const clientPrefix = ev.metadata?.client_name ? `${ev.metadata.client_name} · ` : "";

                  return (
                    <div key={ev.id} className="flex items-start gap-3 text-xs">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
                        style={{ backgroundColor: avatarBg }}
                      >
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-white truncate">
                            <span className="font-semibold text-white">{ev.actor_name}</span>{" "}
                            <span className="text-[var(--text-2)]">{actionText}</span>
                          </p>
                          <span className="text-xs text-[var(--text-3)] shrink-0 tabular-nums">
                            {formatRelativeTime(ev.created_at)}
                          </span>
                        </div>
                        {itemSubtitle && (
                          <p className="text-xs text-[var(--text-3)] truncate mt-0.5">
                            {clientPrefix}
                            {itemSubtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-xs text-[var(--text-3)]">
                  No activity events found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
