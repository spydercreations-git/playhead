"use client";

import React, { useState, useRef, useEffect } from "react";
import { Pen, AtSign, Lock, Users, Send, X, Clock } from "@/components/ui/icon";
import { formatTimecode, TimecodeFormat } from "./timecode";

interface MentionPerson {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface CommentComposerProps {
  currentTimeMs: number;
  fps?: number;
  timecodeFormat?: TimecodeFormat;
  canUseTeamOnly?: boolean; // false for clients and share visitors
  mentionableList?: MentionPerson[];
  hasDrawing?: boolean;
  onToggleDrawing?: () => void;
  onSubmitComment: (data: {
    body: string;
    visibility: "everyone" | "team";
    timecodeStartMs: number | null;
    timecodeEndMs: number | null;
  }) => Promise<void>;
  disabled?: boolean;
}

export function CommentComposer({
  currentTimeMs,
  fps = 24,
  timecodeFormat = "smpte",
  canUseTeamOnly = false,
  mentionableList = [],
  hasDrawing = false,
  onToggleDrawing,
  onSubmitComment,
  disabled = false,
}: CommentComposerProps) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"everyone" | "team">("everyone");
  const [includeTimecode, setIncludeTimecode] = useState(true);
  const [timecodeStartMs, setTimecodeStartMs] = useState<number>(currentTimeMs);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update timecode stamp when playhead moves if text area is empty
  useEffect(() => {
    if (body.trim() === "" && includeTimecode) {
      setTimecodeStartMs(currentTimeMs);
    }
  }, [currentTimeMs, body, includeTimecode]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "@") {
      setShowMentionMenu(true);
      setMentionFilter("");
    }
  };

  const handleSelectMention = (person: MentionPerson) => {
    const handle = `@${person.name.replace(/\s+/g, "")} `;
    setBody((prev) => prev + handle);
    setShowMentionMenu(false);
    textareaRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!body.trim() || submitting || disabled) return;
    try {
      setSubmitting(true);
      await onSubmitComment({
        body: body.trim(),
        visibility: canUseTeamOnly ? visibility : "everyone",
        timecodeStartMs: includeTimecode ? timecodeStartMs : null,
        timecodeEndMs: null,
      });
      setBody("");
    } catch (err) {
      console.error("Failed to submit comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredMentions = mentionableList.filter((m) =>
    m.name.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    m.email.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  return (
    <div className="relative flex flex-col bg-[#181818] border-t border-[#212121] p-4 transition-colors">
      {/* Active Playhead Timecode Chip */}
      <div className="flex items-center gap-2 mb-2">
        {includeTimecode ? (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#FFBB56]/15 text-[#FFBB56] border border-[#FFBB56]/30 text-xs font-mono tabular-nums font-medium">
            <Clock className="w-3 h-3" />
            <span className="tabular-nums">{formatTimecode(timecodeStartMs, timecodeFormat, fps)}</span>
            <button
              onClick={() => setIncludeTimecode(false)}
              className="hover:text-white transition-colors"
              title="Remove timecode (leave general comment)"
            >
              <X className="w-3 h-3 ml-0.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setIncludeTimecode(true);
              setTimecodeStartMs(currentTimeMs);
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#212121] text-[#A3A6AD] hover:text-white text-xs font-mono transition-colors"
            title="Attach current timecode"
          >
            <Clock className="w-3 h-3" />
            <span>+ Timecode</span>
          </button>
        )}

        {hasDrawing && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFBB56]/10 text-[#FFBB56] text-xs font-medium border border-[#FFBB56]/20">
            <Pen className="w-3 h-3" />
            <span>Drawing attached</span>
          </span>
        )}
      </div>

      {/* Main Comment Textarea */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || submitting}
          rows={2}
          placeholder={includeTimecode ? "Leave a comment at this moment... (Cmd+Enter to send)" : "Leave a general comment..."}
          className="w-full bg-[#181818] text-white text-xs rounded-xl border border-[#212121] focus:border-[#FFBB56] focus:ring-1 focus:ring-[#FFBB56] p-3 outline-none resize-none placeholder-[#A3A6AD] transition-all"
        />

        {/* Mention suggestions popover */}
        {showMentionMenu && filteredMentions.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-60 max-h-48 overflow-y-auto bg-[#181818] border border-[#2E2F34] rounded-xl shadow-overlay p-1 z-50">
            <div className="px-2 py-1 text-xs text-[#A3A6AD]  font-semibold">
              Mention someone
            </div>
            {filteredMentions.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectMention(p)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left hover:bg-[#212121] text-xs transition-colors"
              >
                <div>
                  <div className="font-medium text-white">{p.name}</div>
                  <div className="text-xs text-[#A3A6AD]">{p.email}</div>
                </div>
                {p.role && (
                  <span className="text-xs bg-[#212121] px-1.5 py-0.5 rounded text-[#A3A6AD] capitalize">
                    {p.role}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer Actions Strip */}
      <div className="flex items-center justify-between mt-2.5">
        <div className="flex items-center gap-1.5">
          {/* Draw Tool Toggle Button */}
          {onToggleDrawing && (
            <button
              onClick={onToggleDrawing}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                hasDrawing
                  ? "bg-[#FFBB56] text-white"
                  : "bg-[#212121] text-[#A3A6AD] hover:text-white hover:bg-[#2E2F34]"
              }`}
              title="Draw annotation on paused frame"
            >
              <Pen className="w-3.5 h-3.5" />
              <span>Draw</span>
            </button>
          )}

          {/* Mention Button */}
          <button
            onClick={() => setShowMentionMenu(!showMentionMenu)}
            className="p-1.5 rounded-lg text-[#A3A6AD] hover:text-white hover:bg-[#212121] transition-colors"
            title="Mention someone (@)"
          >
            <AtSign className="w-3.5 h-3.5" />
          </button>

          {/* Audience Visibility (Everyone vs Team only) */}
          {canUseTeamOnly && (
            <div className="relative">
              <button
                onClick={() => setVisibility(visibility === "everyone" ? "team" : "everyone")}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  visibility === "team"
                    ? "bg-[#FFBB56]/10 text-[#FFBB56] border-[#FFBB56]/40"
                    : "bg-[#212121] text-[#A3A6AD] border-transparent hover:text-white"
                }`}
                title={visibility === "team" ? "Visible to Team only" : "Visible to Everyone"}
              >
                {visibility === "team" ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-[#FFBB56]" />
                    <span>Team only</span>
                  </>
                ) : (
                  <>
                    <Users className="w-3.5 h-3.5" />
                    <span>Everyone</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Submit Comment Button */}
        <button
          onClick={handleSubmit}
          disabled={!body.trim() || submitting || disabled}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#FFBB56] hover:bg-[#FFBB56] disabled:opacity-40 disabled:hover:bg-[#FFBB56] text-white text-xs font-semibold shadow transition-all"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{submitting ? "Sending..." : "Send"}</span>
        </button>
      </div>
    </div>
  );
}
