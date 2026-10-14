export type TimecodeFormat = "smpte" | "frames" | "seconds";

/**
 * Format milliseconds into SMPTE timecode (HH:MM:SS:FF)
 */
export function formatSMPTE(ms: number, fps: number = 24): string {
  if (isNaN(ms) || ms < 0) ms = 0;
  const safeFps = fps > 0 ? fps : 24;
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds - Math.floor(totalSeconds)) * safeFps);

  const pad = (n: number, z = 2) => String(n).padStart(z, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

/**
 * Format milliseconds into total frame count
 */
export function formatFrames(ms: number, fps: number = 24): string {
  if (isNaN(ms) || ms < 0) ms = 0;
  const safeFps = fps > 0 ? fps : 24;
  const totalFrames = Math.floor((ms / 1000) * safeFps);
  return `${totalFrames} f`;
}

/**
 * Format milliseconds into MM:SS.ms
 */
export function formatSeconds(ms: number): string {
  if (isNaN(ms) || ms < 0) ms = 0;
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centis = Math.floor((ms % 1000) / 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

/**
 * Format time based on chosen format
 */
export function formatTimecode(ms: number, format: TimecodeFormat, fps: number = 24): string {
  switch (format) {
    case "frames":
      return formatFrames(ms, fps);
    case "seconds":
      return formatSeconds(ms);
    case "smpte":
    default:
      return formatSMPTE(ms, fps);
  }
}
