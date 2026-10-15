"use client";

import React, { useRef, useState, useEffect } from "react";
import Hls from "hls.js";
import { Play, Pause, X } from "lucide-react";
import { formatTimecode } from "./timecode";

interface VersionItem {
  id: string;
  number: number;
  width?: number;
  height?: number;
  fps?: number;
  duration_ms?: number;
}

interface VersionCompareProps {
  itemId: string;
  versions: VersionItem[];
  currentVersionNumber: number;
  onClose: () => void;
  fps?: number;
}

export function VersionCompare({
  itemId,
  versions,
  currentVersionNumber,
  onClose,
  fps = 24,
}: VersionCompareProps) {
  const [versionA, setVersionA] = useState<number>(
    versions.length > 1 ? versions[versions.length - 2].number : currentVersionNumber
  );
  const [versionB, setVersionB] = useState<number>(currentVersionNumber);

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(10000);

  const urlA = `/api/v1/items/${itemId}/versions/${versionA}/playlist.m3u8`;
  const urlB = `/api/v1/items/${itemId}/versions/${versionB}/playlist.m3u8`;

  useEffect(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    if (!videoA || !videoB) return;

    let hlsA: Hls | null = null;
    let hlsB: Hls | null = null;

    if (Hls.isSupported()) {
      hlsA = new Hls();
      hlsA.loadSource(urlA);
      hlsA.attachMedia(videoA);

      hlsB = new Hls();
      hlsB.loadSource(urlB);
      hlsB.attachMedia(videoB);
    } else {
      videoA.src = urlA;
      videoB.src = urlB;
    }

    return () => {
      if (hlsA) hlsA.destroy();
      if (hlsB) hlsB.destroy();
    };
  }, [urlA, urlB]);

  const togglePlay = () => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    if (!videoA || !videoB) return;

    if (videoA.paused) {
      videoA.play().catch(console.error);
      videoB.play().catch(console.error);
      setIsPlaying(true);
    } else {
      videoA.pause();
      videoB.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetMs = parseFloat(e.target.value);
    const targetSec = targetMs / 1000;
    if (videoARef.current) videoARef.current.currentTime = targetSec;
    if (videoBRef.current) videoBRef.current.currentTime = targetSec;
    setCurrentTimeMs(targetMs);
  };

  const handleTimeUpdate = () => {
    if (videoARef.current) {
      setCurrentTimeMs(Math.floor(videoARef.current.currentTime * 1000));
      if (videoARef.current.duration && !isNaN(videoARef.current.duration)) {
        setDurationMs(Math.floor(videoARef.current.duration * 1000));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0A0A0B] text-white">
      {/* Top Bar */}
      <div className="flex h-14 items-center justify-between px-6 border-b border-[#222226] bg-[#141416]">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-sm">Side-by-side Version Compare</span>
          <span className="text-xs text-[#71717A]">Synchronized scrubbing</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9A9DA0] hover:text-white hover:bg-[#202024]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Side-by-Side Split Canvas */}
      <div className="flex-1 grid grid-cols-2 gap-2 p-4 bg-[#0A0A0B] overflow-hidden">
        {/* Left Side: Version A */}
        <div className="flex flex-col items-center justify-center relative bg-[#121214] border border-[#222226] rounded-xl overflow-hidden p-2">
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[#18181A]/90 px-3 py-1.5 rounded-lg border border-[#27272A]">
            <span className="text-xs font-semibold text-[#9A9DA0]">Compare:</span>
            <select
              value={versionA}
              onChange={(e) => setVersionA(parseInt(e.target.value))}
              className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.number} className="bg-[#18181A]">
                  Version v{v.number}
                </option>
              ))}
            </select>
          </div>
          <video
            ref={videoARef}
            onTimeUpdate={handleTimeUpdate}
            className="max-h-full max-w-full object-contain"
            muted
          />
        </div>

        {/* Right Side: Version B */}
        <div className="flex flex-col items-center justify-center relative bg-[#121214] border border-[#222226] rounded-xl overflow-hidden p-2">
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-[#18181A]/90 px-3 py-1.5 rounded-lg border border-[#27272A]">
            <span className="text-xs font-semibold text-[#9A9DA0]">Compare:</span>
            <select
              value={versionB}
              onChange={(e) => setVersionB(parseInt(e.target.value))}
              className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.number} className="bg-[#18181A]">
                  Version v{v.number}
                </option>
              ))}
            </select>
          </div>
          <video
            ref={videoBRef}
            className="max-h-full max-w-full object-contain"
            muted
          />
        </div>
      </div>

      {/* Synchronized Control Bar */}
      <div className="h-16 px-6 bg-[#141416] border-t border-[#222226] flex items-center gap-4">
        <button
          onClick={togglePlay}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[#FF5500] hover:bg-[#e04b00] text-white shadow"
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
        </button>

        <input
          type="range"
          min="0"
          max={durationMs}
          value={currentTimeMs}
          onChange={handleSeek}
          className="flex-1 h-1.5 bg-[#27272A] rounded-lg appearance-none cursor-pointer accent-[#FF5500]"
        />

        <div className="text-xs font-mono tabular-nums text-white">
          {formatTimecode(currentTimeMs, "smpte", fps)}
        </div>
      </div>
    </div>
  );
}
