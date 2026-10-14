"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  Lock,
  Download,
  Upload,
  FileText,
  Film,
  Music,
  Check,
  AlertCircle,
  Clock,
  ArrowRight,
  Folder,
} from "lucide-react";
import { ReviewWorkspace } from "@/components/review/review-workspace";

interface PublicShareItem {
  id: string;
  name: string;
  kind: string;
  file_count: number;
  folder_count: number;
  video_count: number;
  total_bytes: number;
  review_status: string;
  created_at: string;
}

export default function PublicSharePage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Identity prompt state
  const [needsIdentity, setNeedsIdentity] = useState(false);
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");

  // Link data
  const [linkData, setLinkData] = useState<{
    id: string;
    name: string;
    access: string;
    allow_download: boolean;
    upload_limit_bytes: number | null;
    items: PublicShareItem[];
  } | null>(null);

  const [activeReviewItem, setActiveReviewItem] = useState<PublicShareItem | null>(null);

  // Uploading state
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchLink() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/s/${token}`);
      if (res.status === 404) {
        setError("This share link does not exist or has been disabled.");
        setLoading(false);
        return;
      }
      if (res.status === 410) {
        setError("This share link has expired.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.password_required) {
        setPasswordRequired(true);
        setLoading(false);
        return;
      }
      setPasswordRequired(false);
      setLinkData(data);

      // Check identity requirement
      const identified = localStorage.getItem(`ph_identified_${token}`);
      if (data.ask_identity && !identified) {
        setNeedsIdentity(true);
      }
    } catch (e: any) {
      setError("Failed to load share link.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      fetchLink();
    }
  }, [token]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    try {
      const res = await fetch(`/api/v1/s/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (!res.ok) {
        const d = await res.json();
        setPasswordError(d.message || "Incorrect password");
        return;
      }
      setPasswordRequired(false);
      await fetchLink();
    } catch (err: any) {
      setPasswordError("Failed to unlock link");
    }
  }

  async function handleIdentify(e: React.FormEvent) {
    e.preventDefault();
    try {
      await fetch(`/api/v1/s/${token}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: visitorName, email: visitorEmail }),
      });
      localStorage.setItem(`ph_identified_${token}`, "true");
      setNeedsIdentity(false);
    } catch (err) {
      setNeedsIdentity(false);
    }
  }

  async function downloadItem(itemId: string) {
    try {
      const res = await fetch(`/api/v1/s/${token}/download/${itemId}`);
      if (!res.ok) {
        alert("Failed to get download URL");
        return;
      }
      const data = await res.json();
      if (data.download_url) {
        window.location.href = data.download_url;
      }
    } catch (err) {
      alert("Download error");
    }
  }

  async function handlePublicUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];

    // Enforce link upload limit
    if (linkData?.upload_limit_bytes && file.size > linkData.upload_limit_bytes) {
      alert(`File size exceeds the upload limit of ${Math.round(linkData.upload_limit_bytes / (1024 * 1024))} MB`);
      return;
    }

    try {
      setUploadProgress(`Initiating upload for ${file.name}...`);
      const initRes = await fetch(`/api/v1/s/${token}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          size_bytes: file.size,
          mime: file.type || "application/octet-stream",
        }),
      });

      if (!initRes.ok) {
        const d = await initRes.json();
        alert(d.message || "Upload rejected");
        setUploadProgress(null);
        return;
      }

      const initData = await initRes.json();
      const { upload_id, upload_url } = initData;
      setUploadProgress(`Uploading ${file.name}...`);

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!putRes.ok) {
        if (upload_id) {
          await fetch(`/api/v1/s/${token}/upload/abort`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ upload_id }),
          });
        }
        alert("Direct upload failed");
        setUploadProgress(null);
        return;
      }

      if (upload_id) {
        await fetch(`/api/v1/s/${token}/upload/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upload_id }),
        });
      }

      setUploadProgress("Upload complete! File submitted.");
      setTimeout(() => setUploadProgress(null), 3000);
      await fetchLink();
    } catch (err) {
      alert("Upload failed");
      setUploadProgress(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D0E] flex items-center justify-center text-xs text-[#9A9DA0]">
        Loading share link...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0D0D0E] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#18181A] border border-[#27272A] rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-semibold text-white">Link Unavailable</h2>
          <p className="text-xs text-[#9A9DA0] mt-2">{error}</p>
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="min-h-screen bg-[#0D0D0E] flex items-center justify-center p-4">
        <form
          onSubmit={handleUnlock}
          className="max-w-sm w-full bg-[#18181A] border border-[#27272A] rounded-2xl p-6 shadow-2xl space-y-4"
        >
          <div className="w-10 h-10 rounded-full bg-[#3366FF]/10 text-[#3366FF] flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <div className="text-center">
            <h2 className="text-base font-semibold text-white">Protected Link</h2>
            <p className="text-xs text-[#9A9DA0] mt-1">
              This link requires a password to view its contents.
            </p>
          </div>

          <div>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter password"
              required
              className="w-full bg-[#121214] border border-[#27272A] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#52525B] focus:outline-none focus:border-[#3366FF]"
            />
            {passwordError && (
              <p className="text-xs text-rose-400 mt-1.5">{passwordError}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[#3366FF] hover:bg-[#2554DB] text-white text-xs font-medium rounded-xl transition-all"
          >
            Unlock & View
          </button>
        </form>
      </div>
    );
  }

  if (needsIdentity) {
    return (
      <div className="min-h-screen bg-[#0D0D0E] flex items-center justify-center p-4">
        <form
          onSubmit={handleIdentify}
          className="max-w-sm w-full bg-[#18181A] border border-[#27272A] rounded-2xl p-6 shadow-2xl space-y-4"
        >
          <div className="text-center">
            <h2 className="text-base font-semibold text-white">Before you continue</h2>
            <p className="text-xs text-[#9A9DA0] mt-1">
              Please enter your name and email to access this project.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-[#9A9DA0] block mb-1">Your Name</label>
              <input
                type="text"
                value={visitorName}
                onChange={(e) => setVisitorName(e.target.value)}
                required
                placeholder="Jane Doe"
                className="w-full bg-[#121214] border border-[#27272A] rounded-xl px-3 py-2 text-xs text-white placeholder-[#52525B] focus:outline-none focus:border-[#3366FF]"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-[#9A9DA0] block mb-1">Your Email</label>
              <input
                type="email"
                value={visitorEmail}
                onChange={(e) => setVisitorEmail(e.target.value)}
                required
                placeholder="jane@agency.com"
                className="w-full bg-[#121214] border border-[#27272A] rounded-xl px-3 py-2 text-xs text-white placeholder-[#52525B] focus:outline-none focus:border-[#3366FF]"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[#3366FF] hover:bg-[#2554DB] text-white text-xs font-medium rounded-xl transition-all"
          >
            Continue
          </button>
        </form>
      </div>
    );
  }

  const items = linkData?.items || [];
  const canUpload = linkData?.access === "upload" || linkData?.access === "comment_upload";

  return (
    <div className="min-h-screen bg-[#0D0D0E] text-white">
      {/* Top Navbar */}
      <header className="h-16 border-b border-[#27272A] px-6 flex items-center justify-between bg-[#121214]/60 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#3366FF] flex items-center justify-center font-bold text-white text-xs">
            PH
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">{linkData?.name}</h1>
            <p className="text-[10px] text-[#9A9DA0]">
              Playhead Public Share · {items.length} {items.length === 1 ? "item" : "items"}
            </p>
          </div>
        </div>

        {canUpload && (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handlePublicUpload(e.target.files)}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#3366FF] hover:bg-[#2554DB] text-white text-xs font-medium rounded-xl transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Upload to Folder</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-6 space-y-6">
        {uploadProgress && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs rounded-xl flex items-center gap-2">
            <Upload className="w-4 h-4 animate-bounce" />
            <span>{uploadProgress}</span>
          </div>
        )}

        {/* Items Grid */}
        {items.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-[#27272A] rounded-2xl">
            <Folder className="w-10 h-10 text-[#52525B] mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-white">No items yet</h3>
            <p className="text-xs text-[#9A9DA0] mt-1">
              {canUpload ? "Use the upload button above to upload files into this folder." : "This link has no shared items."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => {
              const isVideo = item.name.endsWith(".mp4") || item.name.endsWith(".mov");
              const isAudio = item.name.endsWith(".mp3") || item.name.endsWith(".wav");

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isVideo) {
                      setActiveReviewItem(item);
                    }
                  }}
                  className={`bg-[#18181A] border border-[#27272A] hover:border-[#3F3F46] rounded-2xl p-4 transition-all flex flex-col justify-between group ${
                    isVideo ? "cursor-pointer" : ""
                  }`}
                >
                  <div className="h-32 rounded-xl bg-[#121214] border border-[#27272A] flex items-center justify-center mb-3 text-[#71717A]">
                    {item.kind === "folder" ? (
                      <Folder className="w-10 h-10 text-[#3366FF]" />
                    ) : isVideo ? (
                      <Film className="w-10 h-10 text-violet-400 group-hover:scale-110 transition-transform" />
                    ) : isAudio ? (
                      <Music className="w-10 h-10 text-emerald-400" />
                    ) : (
                      <FileText className="w-10 h-10 text-blue-400" />
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-white truncate" title={item.name}>
                      {item.name}
                    </h3>
                    <p className="text-[10px] text-[#9A9DA0] mt-0.5">
                      {item.kind === "folder"
                        ? `${item.file_count || 0} files`
                        : `${(item.total_bytes / (1024 * 1024)).toFixed(1)} MB`}
                    </p>
                  </div>

                  {linkData?.allow_download && item.kind !== "folder" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadItem(item.id);
                      }}
                      className="mt-3 w-full py-1.5 bg-[#27272A] hover:bg-[#323236] text-white text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Review Workspace Modal for Shared Videos */}
      {activeReviewItem && (
        <ReviewWorkspace
          item={{
            id: activeReviewItem.id,
            project_id: "",
            name: activeReviewItem.name,
            kind: activeReviewItem.kind,
            mime: "video/mp4",
            size_bytes: activeReviewItem.total_bytes,
            review_status: activeReviewItem.review_status,
            latest_version_number: 1,
            created_at: activeReviewItem.created_at,
          }}
          itemsList={items.map((i) => ({
            id: i.id,
            project_id: "",
            name: i.name,
            kind: i.kind,
            mime: "video/mp4",
            size_bytes: i.total_bytes,
            review_status: i.review_status,
            latest_version_number: 1,
            created_at: i.created_at,
          }))}
          canDownload={linkData?.allow_download ?? false}
          canApprove={linkData?.access === "comment" || linkData?.access === "comment_upload"}
          canComment={linkData?.access === "comment" || linkData?.access === "comment_upload"}
          isTeamMember={false}
          onClose={() => setActiveReviewItem(null)}
          publicShareToken={token}
        />
      )}
    </div>
  );
}
