"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import {
  X,
  Share2,
  Link as LinkIcon,
  Copy,
  Check,
  Shield,
  Eye,
  MessageSquare,
  Upload,
  Lock,
  Calendar,
  UserCheck,
  Trash2,
  AlertCircle,
} from "@/components/ui/icon";
import { UserAvatar } from "@/components/ui/avatar";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: "project" | "item";
  targetId: string;
  targetName: string;
  userAccessLevel?: string; // "full", "viewer", "commenter", "uploader"
  canCreatePublicLinks?: boolean;
}

export function ShareModal({
  isOpen,
  onClose,
  targetType,
  targetId,
  targetName,
  userAccessLevel = "full",
  canCreatePublicLinks = true,
}: ShareModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"people" | "links">("people");

  // People Tab form state
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState("viewer");
  const [canDownload, setCanDownload] = useState(true);
  const [notify, setNotify] = useState(true);
  const [peopleMessage, setPeopleMessage] = useState<string | null>(null);

  // Link Tab form state
  const [showCreateLink, setShowCreateLink] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkAccess, setLinkAccess] = useState("view");
  const [linkAllowDownload, setLinkAllowDownload] = useState(true);
  const [linkLatestOnly, setLinkLatestOnly] = useState(true);
  const [linkHasPassword, setLinkHasPassword] = useState(false);
  const [linkPassword, setLinkPassword] = useState("");
  const [linkHasExpiry, setLinkHasExpiry] = useState(false);
  const [linkExpiry, setLinkExpiry] = useState("");
  const [linkAskIdentity, setLinkAskIdentity] = useState(true);
  const [linkUploadLimitMB, setLinkUploadLimitMB] = useState(500);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Request Access state (if user is viewer/commenter/uploader)
  const isReadOnlyOrCommenter =
    userAccessLevel === "viewer" ||
    userAccessLevel === "commenter" ||
    userAccessLevel === "uploader";
  const [requestReason, setRequestReason] = useState("");
  const [requestSent, setRequestSent] = useState(false);

  // Fetch Grants
  const grantsEndpoint =
    targetType === "project"
      ? `/projects/${targetId}/grants`
      : `/items/${targetId}/grants`;

  const { data: grants = [], isLoading: grantsLoading } = useQuery({
    queryKey: ["grants", targetType, targetId],
    queryFn: async () => {
      return await apiRequest(grantsEndpoint);
    },
    enabled: isOpen && !isReadOnlyOrCommenter,
  });

  // Fetch Share Links (for project or item)
  const shareLinksEndpoint = `/projects/${targetId}/share-links`;
  const { data: shareLinks = [], isLoading: linksLoading } = useQuery({
    queryKey: ["share-links", targetId],
    queryFn: async () => {
      return await apiRequest(shareLinksEndpoint);
    },
    enabled: isOpen && activeTab === "links" && !isReadOnlyOrCommenter,
  });

  // Add Grant Mutation
  const addGrantMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(grantsEndpoint, {
        method: "POST",
        body: JSON.stringify({
          email,
          level,
          can_download: canDownload,
          notify,
        }),
      });
    },
    onSuccess: () => {
      setEmail("");
      setPeopleMessage("Access granted successfully");
      queryClient.invalidateQueries({ queryKey: ["grants", targetType, targetId] });
      setTimeout(() => setPeopleMessage(null), 3000);
    },
    onError: (err: any) => {
      setPeopleMessage(err.message || "Failed to grant access");
    },
  });

  // Delete Grant Mutation
  const deleteGrantMutation = useMutation({
    mutationFn: async (grantId: string) => {
      return await apiRequest(`/grants/${grantId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grants", targetType, targetId] });
    },
  });

  // Create Share Link Mutation
  const createLinkMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: linkName || `${targetName} Link`,
        access: linkAccess,
        allow_download: linkAllowDownload,
        latest_only: linkLatestOnly,
        ask_identity: linkAskIdentity,
        item_ids: [targetId],
      };
      if (linkHasPassword && linkPassword) {
        payload.password = linkPassword;
      }
      if (linkHasExpiry && linkExpiry) {
        payload.expires_at = new Date(linkExpiry).toISOString();
      }
      if (linkAccess === "upload" || linkAccess === "comment_upload") {
        payload.upload_limit_bytes = linkUploadLimitMB * 1024 * 1024;
      }
      return await apiRequest(`/projects/${targetId}/share-links`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setShowCreateLink(false);
      setLinkName("");
      setLinkPassword("");
      queryClient.invalidateQueries({ queryKey: ["share-links", targetId] });
    },
  });

  // Delete Share Link Mutation
  const deleteLinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      return await apiRequest(`/share-links/${linkId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["share-links", targetId] });
    },
  });

  if (!isOpen) return null;

  // Render "Request Access" UI for users without Full access
  if (isReadOnlyOrCommenter) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-md bg-[var(--bg)] border border-[var(--panel)] rounded-xl p-6 shadow-overlay">
          <div className="flex items-center justify-between pb-4 border-b border-[var(--panel)]">
            <h3 className="text-base font-semibold text-white">Request Access</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[var(--panel)] text-[var(--text-2)] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {requestSent ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-white">Request Sent</h4>
              <p className="text-xs text-[var(--text-2)] mt-1">
                The project owners have been notified. You will receive an email once access is granted.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-4 py-2 bg-[var(--panel)] hover:bg-[var(--border)] text-white text-xs font-medium rounded-xl"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="py-4 space-y-4">
              <p className="text-xs text-[var(--text-2)]">
                You currently have <span className="text-white capitalize">{userAccessLevel}</span> access to <span className="text-white font-medium">{targetName}</span>. To share or manage collaborators, you need Full access.
              </p>
              <div>
                <label className="text-xs font-medium text-[var(--text-2)]  block mb-1">
                  Reason (optional)
                </label>
                <textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  placeholder="Need to add the client colorist to review this cut..."
                  className="w-full h-24 bg-[var(--bg)] border border-[var(--panel)] rounded-xl px-3 py-2 text-xs text-white placeholder-[var(--text-2)] focus:outline-none focus:border-[#4876F3]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-3 py-2 bg-transparent hover:bg-[var(--panel)] text-xs text-[var(--text-2)] hover:text-white rounded-xl"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setRequestSent(true)}
                  className="px-4 py-2 bg-[#4876F3] hover:bg-[#4876F3] text-white text-xs font-medium rounded-xl"
                >
                  Send Request
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl bg-[var(--bg)] border border-[var(--panel)] rounded-xl shadow-overlay flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--panel)]">
          <div>
            <h3 className="text-base font-semibold text-white">Share "{targetName}"</h3>
            <p className="text-xs text-[var(--text-2)] mt-0.5">
              Manage people with direct access or create public share links
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--panel)] text-[var(--text-2)] hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--panel)] px-5 bg-[var(--bg)]">
          <button
            onClick={() => setActiveTab("people")}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === "people"
                ? "border-[#4876F3] text-white"
                : "border-transparent text-[var(--text-2)] hover:text-white"
            }`}
          >
            People (Grants)
          </button>
          <button
            onClick={() => setActiveTab("links")}
            className={`py-3 px-4 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "links"
                ? "border-[#4876F3] text-white"
                : "border-transparent text-[var(--text-2)] hover:text-white"
            }`}
          >
            <span>Public Links</span>
            {shareLinks.length > 0 && (
              <span className="px-1.5 py-0.2 bg-[var(--panel)] text-xs rounded-full text-white">
                {shareLinks.length}
              </span>
            )}
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {activeTab === "people" && (
            <>
              {/* Add Person Form */}
              <div className="space-y-3 bg-[var(--bg)] border border-[var(--panel)] p-4 rounded-xl">
                <label className="text-xs font-semibold text-white block">
                  Add collaborator
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@agency.com"
                    className="flex-1 bg-[var(--bg)] border border-[var(--panel)] rounded-xl px-3 py-2 text-xs text-white placeholder-[var(--text-2)] focus:outline-none focus:border-[#4876F3]"
                  />
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="bg-[var(--bg)] border border-[var(--panel)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#4876F3]"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="commenter">Commenter</option>
                    <option value="uploader">Uploader</option>
                    <option value="full">Full access</option>
                  </select>
                  <button
                    onClick={() => addGrantMutation.mutate()}
                    disabled={!email || addGrantMutation.isPending}
                    className="px-4 py-2 bg-[#4876F3] hover:bg-[#4876F3] disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-all"
                  >
                    {addGrantMutation.isPending ? "Adding..." : "Add"}
                  </button>
                </div>

                <div className="flex items-center gap-6 pt-1 text-xs text-[var(--text-2)]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={canDownload}
                      onChange={(e) => setCanDownload(e.target.checked)}
                      className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                    />
                    <span>Can download original files</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notify}
                      onChange={(e) => setNotify(e.target.checked)}
                      className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                    />
                    <span>Notify by email</span>
                  </label>
                </div>

                {peopleMessage && (
                  <p className="text-xs text-emerald-400 mt-2">{peopleMessage}</p>
                )}
              </div>

              {/* Existing Grants List */}
              <div>
                <h4 className="text-xs font-semibold text-white mb-2">People with access</h4>
                {grantsLoading ? (
                  <div className="py-6 text-center text-xs text-[var(--text-2)]">Loading access list...</div>
                ) : grants.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--text-2)] border border-dashed border-[var(--panel)] rounded-xl">
                    No custom collaborators added yet. Team members access this by company role.
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--panel)] border border-[var(--panel)] rounded-xl overflow-hidden bg-[var(--bg)]">
                    {grants.map((g: any) => (
                      <div key={g.id} className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={g.email} email={g.email} size={32} />
                          <div>
                            <p className="text-xs font-medium text-white">{g.email}</p>
                            <p className="text-xs text-[var(--text-2)]">
                              {g.level.toUpperCase()} · {g.can_download ? "Downloads allowed" : "Downloads forbidden"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => deleteGrantMutation.mutate(g.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--text-2)] hover:text-rose-400"
                            title="Remove access"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "links" && (
            <>
              {!canCreatePublicLinks ? (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Your role does not have permission to generate public share links (<code>sharing.create_public_links</code>). Contact a workspace Admin.
                  </span>
                </div>
              ) : showCreateLink ? (
                /* Create Public Link Form */
                <div className="space-y-4 bg-[var(--bg)] border border-[var(--panel)] p-4 rounded-xl">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-white">New Public Share Link</h4>
                    <button
                      onClick={() => setShowCreateLink(false)}
                      className="text-xs text-[var(--text-2)] hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[var(--text-2)] block mb-1">
                      Link Name
                    </label>
                    <input
                      type="text"
                      value={linkName}
                      onChange={(e) => setLinkName(e.target.value)}
                      placeholder="e.g. Client Review - Rough Cut"
                      className="w-full bg-[var(--bg)] border border-[var(--panel)] rounded-xl px-3 py-2 text-xs text-white placeholder-[var(--text-2)] focus:outline-none focus:border-[#4876F3]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-[var(--text-2)] block mb-1">
                        Visitor Access
                      </label>
                      <select
                        value={linkAccess}
                        onChange={(e) => setLinkAccess(e.target.value)}
                        className="w-full bg-[var(--bg)] border border-[var(--panel)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#4876F3]"
                      >
                        <option value="view">View only</option>
                        <option value="comment">Comment & Review</option>
                        <option value="upload">Upload only (Dropzone)</option>
                        <option value="comment_upload">Review & Upload</option>
                      </select>
                    </div>

                    {(linkAccess === "upload" || linkAccess === "comment_upload") && (
                      <div>
                        <label className="text-xs font-medium text-[var(--text-2)] block mb-1">
                          Max Upload Limit (MB)
                        </label>
                        <input
                          type="number"
                          value={linkUploadLimitMB}
                          onChange={(e) => setLinkUploadLimitMB(parseInt(e.target.value) || 100)}
                          className="w-full bg-[var(--bg)] border border-[var(--panel)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#4876F3]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Security & Access Controls */}
                  <div className="space-y-2.5 pt-2 border-t border-[var(--panel)]">
                    <label className="flex items-center justify-between text-xs text-[var(--text-2)] cursor-pointer">
                      <span>Allow downloads</span>
                      <input
                        type="checkbox"
                        checked={linkAllowDownload}
                        onChange={(e) => setLinkAllowDownload(e.target.checked)}
                        className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs text-[var(--text-2)] cursor-pointer">
                      <span>Always show latest version</span>
                      <input
                        type="checkbox"
                        checked={linkLatestOnly}
                        onChange={(e) => setLinkLatestOnly(e.target.checked)}
                        className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                      />
                    </label>

                    <label className="flex items-center justify-between text-xs text-[var(--text-2)] cursor-pointer">
                      <span>Ask visitor name & email before opening</span>
                      <input
                        type="checkbox"
                        checked={linkAskIdentity}
                        onChange={(e) => setLinkAskIdentity(e.target.checked)}
                        className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                      />
                    </label>

                    {/* Password */}
                    <div className="pt-2">
                      <label className="flex items-center justify-between text-xs text-[var(--text-2)] cursor-pointer">
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Password protect</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={linkHasPassword}
                          onChange={(e) => setLinkHasPassword(e.target.checked)}
                          className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                        />
                      </label>
                      {linkHasPassword && (
                        <input
                          type="password"
                          value={linkPassword}
                          onChange={(e) => setLinkPassword(e.target.value)}
                          placeholder="Enter link password"
                          className="mt-2 w-full bg-[var(--bg)] border border-[var(--panel)] rounded-xl px-3 py-2 text-xs text-white placeholder-[var(--text-2)] focus:outline-none focus:border-[#4876F3]"
                        />
                      )}
                    </div>

                    {/* Expiry */}
                    <div className="pt-2">
                      <label className="flex items-center justify-between text-xs text-[var(--text-2)] cursor-pointer">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Set expiry date</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={linkHasExpiry}
                          onChange={(e) => setLinkHasExpiry(e.target.checked)}
                          className="rounded border-[var(--panel)] text-[#4876F3] focus:ring-0"
                        />
                      </label>
                      {linkHasExpiry && (
                        <input
                          type="datetime-local"
                          value={linkExpiry}
                          onChange={(e) => setLinkExpiry(e.target.value)}
                          className="mt-2 w-full bg-[var(--bg)] border border-[var(--panel)] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#4876F3]"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3">
                    <button
                      onClick={() => setShowCreateLink(false)}
                      className="px-3 py-2 bg-transparent hover:bg-[var(--panel)] text-xs text-[var(--text-2)] hover:text-white rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => createLinkMutation.mutate()}
                      disabled={createLinkMutation.isPending}
                      className="px-4 py-2 bg-[#4876F3] hover:bg-[#4876F3] disabled:opacity-50 text-white text-xs font-medium rounded-xl"
                    >
                      {createLinkMutation.isPending ? "Generating..." : "Generate Link"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--text-2)]">
                    Anyone with a link can access according to its permissions.
                  </p>
                  <button
                    onClick={() => setShowCreateLink(true)}
                    className="px-3 py-1.5 bg-[#4876F3] hover:bg-[#4876F3] text-white text-xs font-medium rounded-xl"
                  >
                    + Create Link
                  </button>
                </div>
              )}

              {/* Links List */}
              <div className="space-y-2 pt-2">
                {linksLoading ? (
                  <div className="py-6 text-center text-xs text-[var(--text-2)]">Loading links...</div>
                ) : shareLinks.length === 0 ? (
                  <div className="py-6 text-center text-xs text-[var(--text-2)] border border-dashed border-[var(--panel)] rounded-xl">
                    No public links created yet.
                  </div>
                ) : (
                  shareLinks.map((link: any) => {
                    const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/s/${link.id}`;
                    return (
                      <div
                        key={link.id}
                        className="p-3 bg-[var(--bg)] border border-[var(--panel)] rounded-xl flex items-center justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{link.name}</span>
                            <span className="px-2 py-0.5 text-xs bg-[var(--panel)] text-blue-400 rounded-md  font-medium">
                              {link.access}
                            </span>
                            {link.has_password && (
                              <span className="text-xs text-amber-400 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Password
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--text-2)]">
                            {link.view_count || 0} views · {link.allow_download ? "Downloads enabled" : "Downloads off"}
                            {link.expires_at ? ` · Expires ${new Date(link.expires_at).toLocaleDateString()}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(publicUrl);
                              setCopiedToken(link.id);
                              setTimeout(() => setCopiedToken(null), 2000);
                            }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--panel)] hover:bg-[var(--border)] text-white text-xs rounded-lg transition-all"
                          >
                            {copiedToken === link.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => deleteLinkMutation.mutate(link.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--text-2)] hover:text-rose-400"
                            title="Delete link"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
