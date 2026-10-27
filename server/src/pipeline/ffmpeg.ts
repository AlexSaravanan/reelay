import { config } from "../config.js";
import { run } from "./proc.js";

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
}

/** Probe a media file for duration and video dimensions. */
export async function probe(file: string): Promise<MediaInfo> {
  const { stdout } = await run(config.ffprobeBin, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "format=duration:stream=width,height",
    "-of",
    "json",
    file,
  ]);
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0] ?? {};
  return {
    duration: parseFloat(data.format?.duration ?? "0"),
    width: Number(stream.width ?? 0),
    height: Number(stream.height ?? 0),
  };
}

let subtitlesSupport: boolean | null = null;

/**
 * Whether this ffmpeg build has the libass-backed `subtitles` filter.
 * Cached after the first probe. Without it, captions can't be burned.
 */
export async function hasSubtitlesFilter(): Promise<boolean> {
  if (subtitlesSupport !== null) return subtitlesSupport;
  try {
    const { stdout } = await run(config.ffmpegBin, ["-hide_banner", "-filters"]);
    subtitlesSupport = /\bsubtitles\b/.test(stdout);
  } catch {
    subtitlesSupport = false;
  }
  return subtitlesSupport;
}

/** Extract a mono 16kHz wav for transcription (what Whisper wants). */
export async function extractAudio(
  videoPath: string,
  outWav: string,
  signal?: AbortSignal,
): Promise<void> {
  await run(
    config.ffmpegBin,
    ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-f", "wav", outWav],
    { signal },
  );
}
