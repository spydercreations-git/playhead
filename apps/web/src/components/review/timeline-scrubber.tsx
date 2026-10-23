"use client";

import React, { useRef, useState, useCallback } from "react";
import { Lock } from "@/components/ui/icon";
import { formatTimecode, TimecodeFormat } from "./timecode";

export interface ReviewCommentMarker {
  id: string;
  author_name: string;
  timecode_start_ms: number | null;
  timecode_end_ms: number | null;
  visibility: string;
  body: string;
  resolved: boolean;
}

interface TimelineScrubberProps {
  currentTimeMs: number;
  durationMs: number;
  fps?: number;
  timecodeFormat?: TimecodeFormat;
  comments: ReviewCommentMarker[];
  showMarkers?: boolean;
  onSeek: (timeMs: number) => void;
  onSelectComment?: (commentId: string) => void;
  spriteUrl?: string;
  spriteJson?: {
    frame_width: number;
    frame_height: number;
    total_frames: number;
    interval_seconds: number;
  } | null;
  waveformPeaks?: number[]; // normalized 0..100
}

export function TimelineScrubber({
  currentTimeMs,
  durationMs,
  fps = 24,
  timecodeFormat = "smpte",
  comments,
  showMarkers = true,
  onSeek,
  onSelectComment,
  spriteUrl,
  spriteJson,
  waveformPeaks,
}: TimelineScrubberProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [hoverTimeMs, setHoverTimeMs] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const safeDuration = durationMs > 0 ? durationMs : 1;
  const progressPercent = Math.min(100, Math.max(0, (currentTimeMs / safeDuration) * 100));

  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!barRef.current) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const ratio = clickX / rect.width;
      return ratio * safeDuration;
    },
    [safeDuration]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    const newTime = getTimeFromEvent(e);
    onSeek(newTime);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const movedTime = getTimeFromEvent(moveEvent);
      onSeek(movedTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    setHoverX(x);
    setHoverTimeMs((x / rect.width) * safeDuration);
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      setHoverTimeMs(null);
    }
  };

  // Thumbnail sprite offset calculation
  const getSpriteStyle = (hoverMs: number) => {
    if (!spriteUrl || !spriteJson || !spriteJson.interval_seconds) return null;
    const hoverSec = hoverMs / 1000;
    const frameIndex = Math.min(
      spriteJson.total_frames - 1,
      Math.max(0, Math.floor(hoverSec / spriteJson.interval_seconds))
    );
    const width = 160;
    const height = Math.round((spriteJson.frame_height / spriteJson.frame_width) * width);
    const bgY = -(frameIndex * height);

    return {
      width: `${width}px`,
      height: `${height}px`,
      backgroundImage: `url(${spriteUrl})`,
      backgroundPosition: `0px ${bgY}px`,
      backgroundSize: `${width}px auto`,
    };
  };

  return (
    <div className="relative w-full py-2 select-none group">
      {/* Waveform Visualization (if present) */}
      {waveformPeaks && waveformPeaks.length > 0 && (
        <div className="absolute inset-x-0 bottom-2.5 h-6 flex items-center gap-[1px] pointer-events-none opacity-40 group-hover:opacity-60 transition-opacity">
          {waveformPeaks.map((peak, idx) => (
            <div
              key={idx}
              className="flex-1 bg-[var(--text-2)] rounded-full"
              style={{ height: `${Math.max(10, Math.min(100, peak))}%` }}
            />
          ))}
        </div>
      )}

      {/* Main Bar Track */}
      <div
        ref={barRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative h-2 w-full bg-[var(--panel)] hover:h-3 rounded-full cursor-pointer transition-all flex items-center"
      >
        {/* Progress Played Bar */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-[#FFBB56] rounded-full transition-[width] duration-75"
          style={{ width: `${progressPercent}%` }}
        />

        {/* Range Comment Colored Bands */}
        {showMarkers &&
          comments.map((c) => {
            if (c.timecode_start_ms == null || c.timecode_end_ms == null || c.timecode_end_ms <= c.timecode_start_ms) {
              return null;
            }
            const leftPct = (c.timecode_start_ms / safeDuration) * 100;
            const widthPct = ((c.timecode_end_ms - c.timecode_start_ms) / safeDuration) * 100;
            const isTeam = c.visibility === "team";
            return (
              <div
                key={`range-${c.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(c.timecode_start_ms!);
                  if (onSelectComment) onSelectComment(c.id);
                }}
                className={`absolute top-0 bottom-0 z-10 rounded-sm opacity-80 hover:opacity-100 transition-opacity ${
                  isTeam ? "bg-[#FFBB56]/60 border-t border-b border-[#FFBB56]" : "bg-[#FFBB56]/50 border-t border-b border-[#FFBB56]"
                }`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`${c.author_name}: ${c.body.substring(0, 40)}`}
              />
            );
          })}

        {/* Comment Point Markers */}
        {showMarkers &&
          comments.map((c) => {
            if (c.timecode_start_ms == null) return null;
            const markerPct = (c.timecode_start_ms / safeDuration) * 100;
            const isTeam = c.visibility === "team";
            const initial = (c.author_name || "U").charAt(0).toUpperCase();

            return (
              <button
                key={`marker-${c.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(c.timecode_start_ms!);
                  if (onSelectComment) onSelectComment(c.id);
                }}
                className="absolute -top-1.5 -translate-x-1/2 z-20 flex flex-col items-center group/marker transition-all"
                style={{ left: `${markerPct}%` }}
                title={`${c.author_name} (${isTeam ? "Team only" : "Everyone"}): ${c.body.substring(0, 40)}`}
              >
                {/* Marker Avatar */}
                <div
                  className={`relative flex items-center justify-center w-5 h-5 rounded-full border shadow text-xs font-bold text-white ${
                    isTeam
                      ? "bg-[#FFBB56] border-[#FFBB56]"
                      : c.resolved
                      ? "bg-[#3FCF8E] border-white"
                      : "bg-[#FFBB56] border-white"
                  }`}
                >
                  {initial}
                  {isTeam && (
                    <Lock className="absolute -top-1 -right-1 w-3 h-3 text-[#FFBB56] bg-[var(--bg)] rounded-full p-[1px]" />
                  )}
                </div>
              </button>
            );
          })}

        {/* Playhead Scrubber Handle */}
        <div
          className="absolute -top-1.5 w-5 h-5 rounded-full bg-white shadow-lg border-2 border-[#FFBB56] -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-30"
          style={{ left: `${progressPercent}%` }}
        >
          <div className="w-1.5 h-1.5 bg-[#FFBB56] rounded-full" />
        </div>
      </div>

      {/* Hover Thumbnail and Timecode Tooltip */}
      {hoverTimeMs !== null && (
        <div
          className="absolute bottom-6 -translate-x-1/2 z-40 flex flex-col items-center pointer-events-none"
          style={{ left: `${hoverX}px` }}
        >
          {/* Sprite frame thumbnail if available */}
          {spriteUrl && spriteJson && (
            <div
              className="rounded-lg border border-[var(--border-strong)] shadow-overlay overflow-hidden bg-black mb-1.5"
              style={getSpriteStyle(hoverTimeMs) || {}}
            />
          )}

          {/* Timecode badge */}
          <div className="bg-[var(--bg)]/95 text-white text-xs font-mono tabular-nums px-2 py-0.5 rounded shadow border border-[var(--border-strong)]">
            {formatTimecode(hoverTimeMs, timecodeFormat, fps)}
          </div>
        </div>
      )}
    </div>
  );
}
