"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sliders,
  ChevronDown,
  Layers,
  Sparkles,
  Columns,
  MessageSquare,
  Music,
} from "@/components/ui/icon";
import { formatTimecode, TimecodeFormat } from "./timecode";
import { TimelineScrubber, ReviewCommentMarker } from "./timeline-scrubber";
import { DrawingOverlay, DrawingData } from "./drawing-overlay";

interface VideoPlayerProps {
  playlistUrl: string;
  originalFallbackUrl?: string;
  isAudio?: boolean;
  mime?: string;
  fileName: string;
  versionNumber: number;
  uploaderName?: string;
  uploadDate?: string;
  width?: number;
  height?: number;
  fps?: number;
  durationMs?: number;
  fileSizeBytes?: number;
  comments: ReviewCommentMarker[];
  activeDrawing?: DrawingData | null;
  isDrawingMode?: boolean;
  onDrawingChange?: (data: DrawingData | null) => void;
  onDrawingClose?: () => void;
  onTimeUpdate?: (currentMs: number) => void;
  onSeekToComment?: (commentId: string) => void;
  spriteUrl?: string;
  spriteJson?: any;
  waveformPeaks?: number[];
  onToggleCompare?: () => void;
  isComparing?: boolean;
  canDownload?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function VideoPlayer({
  playlistUrl,
  originalFallbackUrl,
  isAudio = false,
  mime,
  fileName,
  versionNumber,
  uploaderName,
  uploadDate,
  width,
  height,
  fps = 24,
  durationMs: initialDurationMs = 0,
  fileSizeBytes = 0,
  comments,
  activeDrawing,
  isDrawingMode = false,
  onDrawingChange,
  onDrawingClose,
  onTimeUpdate,
  onSeekToComment,
  spriteUrl,
  spriteJson,
  waveformPeaks,
  onToggleCompare,
  isComparing = false,
  canDownload = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(initialDurationMs);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [timecodeFormat, setTimecodeFormat] = useState<TimecodeFormat>("smpte");
  const [showTimecodeMenu, setShowTimecodeMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<Array<{ id: number; name: string }>>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = Auto
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Frame step interval
  const frameIntervalSec = 1 / (fps > 0 ? fps : 24);

  // Initialize HLS Player or Fallback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playlistUrl) return;

    setErrorMessage(null);

    // Destroy existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });
      hlsRef.current = hls;

      hls.loadSource(playlistUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels = data.levels.map((lvl, idx) => ({
          id: idx,
          name: lvl.height ? `${lvl.height}p` : `${lvl.bitrate / 1000}k`,
        }));
        setQualityLevels(levels);
      });

      // Requirement 4: Quietly reload playlist when segment link expires (403) so paused video keeps working
      hls.on(Hls.Events.ERROR, (_, errorData) => {
        if (errorData.type === Hls.ErrorTypes.NETWORK_ERROR && errorData.response?.code === 403) {
          console.warn("HLS segment expired (403), quietly reloading playlist...");
          hls.loadSource(playlistUrl);
          return;
        }

        if (errorData.fatal) {
          switch (errorData.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              // Fallback to original URL if allowed
              if (originalFallbackUrl && canDownload) {
                video.src = originalFallbackUrl;
              } else {
                setErrorMessage("Media processing or preview unavailable");
              }
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari / iOS native HLS
      video.src = playlistUrl;
    } else if (originalFallbackUrl && canDownload) {
      // Direct raw video fallback
      video.src = originalFallbackUrl;
    } else {
      setErrorMessage("HLS playback is not supported on this browser.");
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playlistUrl, originalFallbackUrl, canDownload]);

  // Video event handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const ms = Math.floor(video.currentTime * 1000);
    setCurrentTimeMs(ms);
    if (onTimeUpdate) onTimeUpdate(ms);
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.duration && !isNaN(video.duration)) {
      setDurationMs(Math.floor(video.duration * 1000));
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(console.error);
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (targetMs: number) => {
    const video = videoRef.current;
    if (!video) return;
    const safeSec = Math.max(0, Math.min(targetMs / 1000, (durationMs || 10000) / 1000));
    video.currentTime = safeSec;
    setCurrentTimeMs(targetMs);
  };

  const stepFrame = (forward: boolean) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
    const newSec = forward ? video.currentTime + frameIntervalSec : video.currentTime - frameIntervalSec;
    video.currentTime = Math.max(0, Math.min(newSec, (durationMs || 10000) / 1000));
  };

  const jumpSeconds = (secs: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.currentTime + secs, (durationMs || 10000) / 1000));
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVol;
    setVolume(newVol);
    video.muted = newVol === 0;
    setIsMuted(video.muted);
  };

  const handleSpeedChange = (rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  };

  const handleQualityChange = (levelId: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId;
      setCurrentQuality(levelId);
    }
    setShowQualityMenu(false);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  // Keyboard navigation shortcuts (J, K, L, Space, Left/Right arrows, M, F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in input or textarea
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "j":
          e.preventDefault();
          jumpSeconds(-5);
          break;
        case "l":
          e.preventDefault();
          jumpSeconds(5);
          break;
        case "arrowleft":
          e.preventDefault();
          stepFrame(false);
          break;
        case "arrowright":
          e.preventDefault();
          stepFrame(true);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, durationMs, fps]);

  // Determine aspect ratio style
  const aspectRatioStyle =
    width && height && width > 0 && height > 0
      ? { aspectRatio: `${width} / ${height}` }
      : undefined;

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full bg-[var(--bg)] text-white select-none overflow-hidden"
    >
      {/* Matte Black Video Canvas Area */}
      <div className="relative flex-1 flex items-center justify-center p-4 bg-[var(--bg)] overflow-hidden min-h-0">
        {/* Error message fallback */}
        {errorMessage ? (
          <div className="p-8 text-center max-w-md bg-[var(--bg)] border border-[var(--panel)] rounded-xl shadow-xl">
            <Sparkles className="w-10 h-10 text-[#FFBB56] mx-auto mb-3" />
            <h3 className="text-sm font-semibold mb-1 text-white">Media Processing</h3>
            <p className="text-xs text-[var(--text-2)] mb-4">{errorMessage}</p>
          </div>
        ) : isAudio ? (
          /* Audio player visualization */
          <div className="flex flex-col items-center justify-center w-full max-w-xl p-8 bg-[var(--bg)] border border-[var(--panel)] rounded-xl shadow-overlay">
            <div className="w-20 h-20 rounded-xl bg-[#FFBB56]/10 border border-[#FFBB56]/20 flex items-center justify-center mb-6">
              <Music className="w-10 h-10 text-[#FFBB56]" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1 truncate max-w-md">{fileName}</h3>
            <span className="text-xs text-[var(--text-2)] mb-8 font-mono">v{versionNumber} &middot; Audio Track</span>

            {/* Audio Waveform visualization */}
            <div className="w-full h-24 flex items-center justify-between gap-[2px] bg-[var(--bg)] p-4 rounded-xl border border-[var(--panel)] mb-6">
              {(waveformPeaks || Array.from({ length: 64 }, (_, i) => Math.sin(i / 4) * 40 + 50)).map(
                (peak, idx) => (
                  <div
                    key={idx}
                    className="flex-1 bg-[#FFBB56] rounded-full transition-all"
                    style={{
                      height: `${Math.max(10, Math.min(100, peak))}%`,
                      opacity: (idx / 64) * 100 <= (currentTimeMs / (durationMs || 1)) * 100 ? 1 : 0.3,
                    }}
                  />
                )
              )}
            </div>
            <audio
              ref={videoRef as any}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              loop={isLooping}
            />
          </div>
        ) : (
          /* Video Canvas Element with Native Aspect Ratio */
          <div
            className="relative max-h-full max-w-full flex items-center justify-center shadow-overlay rounded-lg overflow-hidden border border-[var(--panel)]"
            style={aspectRatioStyle}
          >
            <video
              ref={videoRef}
              onClick={togglePlay}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              loop={isLooping}
              playsInline
              className="max-h-full max-w-full object-contain cursor-pointer"
              style={aspectRatioStyle}
            />

            {/* Interactive Drawing Canvas Overlay */}
            <DrawingOverlay
              isEditing={isDrawingMode}
              drawingData={activeDrawing}
              onSaveDrawing={onDrawingChange}
              onClose={onDrawingClose}
            />
          </div>
        )}
      </div>

      {/* Scrubber Timeline Area */}
      <div className="px-6 pt-2 bg-[var(--bg)] border-t border-[var(--panel)]">
        <TimelineScrubber
          currentTimeMs={currentTimeMs}
          durationMs={durationMs}
          fps={fps}
          timecodeFormat={timecodeFormat}
          comments={comments}
          showMarkers={showMarkers}
          onSeek={seekTo}
          onSelectComment={onSeekToComment}
          spriteUrl={spriteUrl}
          spriteJson={spriteJson}
          waveformPeaks={waveformPeaks}
        />
      </div>

      {/* Main Player Controls Bar */}
      <div className="flex items-center justify-between h-14 px-6 bg-[var(--bg)] border-b border-[var(--panel)]">
        {/* Left: Playback, Frame Step, Volume */}
        <div className="flex items-center gap-3">
          {/* Play / Pause button */}
          <button
            onClick={togglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-[#FFBB56] hover:bg-[#FFBB56] text-white shadow transition-all hover:scale-[1.015]"
            title={isPlaying ? "Pause (Space/K)" : "Play (Space/K)"}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>

          {/* Jump 5s Back */}
          <button
            onClick={() => jumpSeconds(-5)}
            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-white hover:bg-[var(--bg)] transition-colors"
            title="Rewind 5s (J)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Frame Step Back */}
          <button
            onClick={() => stepFrame(false)}
            className="px-2 py-1 rounded text-xs font-mono text-[var(--text-2)] hover:text-white hover:bg-[var(--bg)] transition-colors"
            title="Step Back 1 Frame (Left Arrow)"
          >
            &lt; 1f
          </button>

          {/* Frame Step Forward */}
          <button
            onClick={() => stepFrame(true)}
            className="px-2 py-1 rounded text-xs font-mono text-[var(--text-2)] hover:text-white hover:bg-[var(--bg)] transition-colors"
            title="Step Forward 1 Frame (Right Arrow)"
          >
            1f &gt;
          </button>

          {/* Volume Slider */}
          <div className="flex items-center gap-2 group/vol pl-2">
            <button
              onClick={toggleMute}
              className="text-[var(--text-2)] hover:text-white transition-colors"
              title="Mute / Unmute (M)"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1 bg-[var(--panel)] rounded-lg appearance-none cursor-pointer accent-[#FFBB56]"
            />
          </div>
        </div>

        {/* Center: Timecode Display with Format Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowTimecodeMenu(!showTimecodeMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg)] hover:bg-[var(--panel)] border border-[var(--border)] text-xs font-mono tabular-nums tracking-wider transition-colors"
          >
            <span className="text-white font-semibold tabular-nums">{formatTimecode(currentTimeMs, timecodeFormat, fps)}</span>
            <span className="text-[var(--text-2)]">/</span>
            <span className="text-[var(--text-2)] tabular-nums">{formatTimecode(durationMs, timecodeFormat, fps)}</span>
            <ChevronDown className="w-3 h-3 text-[var(--text-2)] ml-1" />
          </button>

          {/* Timecode Format Dropdown */}
          {showTimecodeMenu && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-44 bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-overlay p-1 z-50">
              <button
                onClick={() => {
                  setTimecodeFormat("smpte");
                  setShowTimecodeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono ${
                  timecodeFormat === "smpte" ? "bg-[#FFBB56] text-white" : "text-[var(--text-2)] hover:bg-[var(--panel)]"
                }`}
              >
                Timecode SMPTE
              </button>
              <button
                onClick={() => {
                  setTimecodeFormat("frames");
                  setShowTimecodeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono ${
                  timecodeFormat === "frames" ? "bg-[#FFBB56] text-white" : "text-[var(--text-2)] hover:bg-[var(--panel)]"
                }`}
              >
                Frames (f)
              </button>
              <button
                onClick={() => {
                  setTimecodeFormat("seconds");
                  setShowTimecodeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono ${
                  timecodeFormat === "seconds" ? "bg-[#FFBB56] text-white" : "text-[var(--text-2)] hover:bg-[var(--panel)]"
                }`}
              >
                Seconds (s)
              </button>
            </div>
          )}
        </div>

        {/* Right: Loop, Speed, Quality, Markers, Version Compare, Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`p-1.5 rounded-lg transition-colors text-xs ${
              isLooping ? "bg-[#FFBB56]/20 text-[#FFBB56] border border-[#FFBB56]/30" : "text-[var(--text-2)] hover:text-white"
            }`}
            title="Toggle Loop"
          >
            Loop
          </button>

          {/* Speed Selector */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-[var(--text-2)] hover:text-white hover:bg-[var(--bg)] transition-colors"
              title="Playback speed"
            >
              <span>{playbackRate}x</span>
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-10 right-0 w-24 bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-overlay p-1 z-50">
                {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                  <button
                    key={rate}
                    onClick={() => handleSpeedChange(rate)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono ${
                      playbackRate === rate ? "bg-[#FFBB56] text-white" : "text-[var(--text-2)] hover:bg-[var(--panel)]"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quality Selector */}
          {qualityLevels.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono text-[var(--text-2)] hover:text-white hover:bg-[var(--bg)] transition-colors"
                title="Resolution quality"
              >
                <span>{currentQuality === -1 ? "Auto" : qualityLevels[currentQuality]?.name}</span>
              </button>
              {showQualityMenu && (
                <div className="absolute bottom-10 right-0 w-28 bg-[var(--bg)] border border-[var(--border)] rounded-xl shadow-overlay p-1 z-50">
                  <button
                    onClick={() => handleQualityChange(-1)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono ${
                      currentQuality === -1 ? "bg-[#FFBB56] text-white" : "text-[var(--text-2)] hover:bg-[var(--panel)]"
                    }`}
                  >
                    Auto
                  </button>
                  {qualityLevels.map((lvl) => (
                    <button
                      key={lvl.id}
                      onClick={() => handleQualityChange(lvl.id)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono ${
                        currentQuality === lvl.id ? "bg-[#FFBB56] text-white" : "text-[var(--text-2)] hover:bg-[var(--panel)]"
                      }`}
                    >
                      {lvl.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Markers toggle */}
          <button
            onClick={() => setShowMarkers(!showMarkers)}
            className={`p-1.5 rounded-lg transition-colors ${
              showMarkers ? "text-[#FFBB56]" : "text-[var(--text-2)] hover:text-[var(--text-2)]"
            }`}
            title={showMarkers ? "Hide Comment Markers" : "Show Comment Markers"}
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          {/* Version Compare mode button (Requirement 10) */}
          {onToggleCompare && (
            <button
              onClick={onToggleCompare}
              className={`p-1.5 rounded-lg transition-colors ${
                isComparing ? "bg-[#FFBB56] text-white" : "text-[var(--text-2)] hover:text-white hover:bg-[var(--bg)]"
              }`}
              title="Side-by-side Version Compare"
            >
              <Columns className="w-4 h-4" />
            </button>
          )}

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-[var(--text-2)] hover:text-white hover:bg-[var(--bg)] transition-colors"
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Metadata Strip directly beneath controls */}
      <div className="flex items-center justify-between px-6 py-2 bg-[var(--bg)] border-t border-[var(--bg)] text-xs text-[var(--text-2)] font-mono">
        <div className="flex items-center gap-3">
          <span className="rounded bg-[var(--panel)] px-1.5 py-0.5 font-bold text-white">v{versionNumber}</span>
          {uploaderName && <span>Uploaded by {uploaderName}</span>}
          {uploadDate && <span>&middot; {uploadDate}</span>}
        </div>
        <div className="flex items-center gap-4">
          {width && height ? <span>{width}&times;{height}</span> : null}
          {fps ? <span>{fps} fps</span> : null}
          {fileSizeBytes > 0 && <span>{formatBytes(fileSizeBytes)}</span>}
        </div>
      </div>
    </div>
  );
}
