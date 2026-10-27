import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import type { AspectRatio, Clip, Highlight, Transcript } from "../types.js";
import { writeClipCaptions } from "./captions.js";
import { hasSubtitlesFilter, probe } from "./ffmpeg.js";
import { run } from "./proc.js";

// Output pixel dimensions for each supported frame. Short side is 1080.
const FRAME: Record<AspectRatio, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "4:3": { w: 1440, h: 1080 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

/**
 * Render each highlight into a vertical 9:16 mp4 with burned captions,
 * plus a thumbnail. Reports progress across the whole batch.
 */
export async function renderClips(
  videoPath: string,
  dir: string,
  transcript: Transcript,
  highlights: Highlight[],
  captionsOn: boolean,
  aspect: AspectRatio,
  onProgress: (pct: number, msg: string) => void,
  signal?: AbortSignal,
): Promise<Clip[]> {
  const clipsDir = path.join(dir, "clips");
  await fs.mkdir(clipsDir, { recursive: true });
  const frame = FRAME[aspect];

  const info = await probe(videoPath);
  const clips: Clip[] = [];

  // Captions need the libass-backed `subtitles` filter; skip if unavailable.
  const canCaption = captionsOn && (await hasSubtitlesFilter());
  if (captionsOn && !canCaption) {
    console.warn(
      "Captions requested but this ffmpeg build lacks the `subtitles` filter (libass). Rendering without captions.",
    );
  }

  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    onProgress(
      (i / highlights.length) * 100,
      `Rendering clip ${i + 1} of ${highlights.length}…`,
    );

    const out = await renderOne(
      videoPath,
      info,
      clipsDir,
      `clip-${i + 1}`,
      transcript,
      h.start,
      h.end,
      canCaption,
      frame,
      signal,
    );
    clips.push({ ...h, id: nanoid(8), ...out });
  }

  onProgress(100, "Clips ready.");
  return clips;
}

/**
 * Re-render a single clip over a new [start, end] range — used when the user
 * nudges a clip's in/out points. A fresh output filename is used so the browser
 * never shows a stale cached video/thumbnail.
 */
export async function renderClipRange(
  videoPath: string,
  dir: string,
  transcript: Transcript,
  start: number,
  end: number,
  captionsOn: boolean,
  aspect: AspectRatio,
  signal?: AbortSignal,
): Promise<{ file: string; thumbnail: string; durationSec: number }> {
  const clipsDir = path.join(dir, "clips");
  await fs.mkdir(clipsDir, { recursive: true });
  const frame = FRAME[aspect];
  const info = await probe(videoPath);
  const canCaption = captionsOn && (await hasSubtitlesFilter());
  return renderOne(
    videoPath,
    info,
    clipsDir,
    `clip-${nanoid(8)}`,
    transcript,
    start,
    end,
    canCaption,
    frame,
    signal,
  );
}

/** Render one clip (video + thumbnail) for [start, end] into `base`.{mp4,jpg}. */
async function renderOne(
  videoPath: string,
  info: { width: number; height: number },
  clipsDir: string,
  base: string,
  transcript: Transcript,
  start: number,
  end: number,
  canCaption: boolean,
  frame: { w: number; h: number },
  signal?: AbortSignal,
): Promise<{ file: string; thumbnail: string; durationSec: number }> {
  const outFile = path.join(clipsDir, `${base}.mp4`);
  const thumbFile = path.join(clipsDir, `${base}.jpg`);

  // Caption file (relative times) — optional.
  let assPath: string | null = null;
  if (canCaption) {
    const p = path.join(clipsDir, `${base}.ass`);
    const ok = await writeClipCaptions(transcript, start, end, p, frame.w, frame.h);
    if (ok) assPath = p;
  }

  const vf = buildVideoFilter(info.width, info.height, frame, assPath);
  const duration = end - start;

  await run(config.ffmpegBin, [
    "-y",
    // Seek before input for speed, then re-seek precisely.
    "-ss",
    start.toFixed(3),
    "-i",
    videoPath,
    "-t",
    duration.toFixed(3),
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outFile,
  ], { signal });

  // Thumbnail from the middle of the clip.
  await run(
    config.ffmpegBin,
    ["-y", "-ss", (duration / 2).toFixed(3), "-i", outFile, "-frames:v", "1", "-q:v", "3", thumbFile],
    { signal },
  );

  return {
    file: `clips/${base}.mp4`,
    thumbnail: `clips/${base}.jpg`,
    durationSec: Math.round(duration),
  };
}

/**
 * Crop the source to a centered frame matching the target aspect ratio, scale
 * to the target pixel size, then burn captions if present. Crop dimensions are
 * computed numerically from the known source size so the filtergraph carries no
 * comma-bearing expressions (which the parser would otherwise mistake for
 * filter separators).
 */
function buildVideoFilter(
  width: number,
  height: number,
  frame: { w: number; h: number },
  assPath: string | null,
): string {
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);

  // Largest centered frame.w:frame.h rectangle that fits inside the source.
  let cropW = Math.min(width, Math.round((height * frame.w) / frame.h));
  let cropH = Math.min(height, Math.round((width * frame.h) / frame.w));
  cropW = even(cropW);
  cropH = even(cropH);
  const x = Math.max(0, Math.floor((width - cropW) / 2));
  const y = Math.max(0, Math.floor((height - cropH) / 2));

  const parts = [
    `crop=${cropW}:${cropH}:${x}:${y}`,
    `scale=${frame.w}:${frame.h}:flags=lanczos`,
  ];
  if (assPath) {
    // Inside the subtitles filter, escape the path's colons for the parser.
    const escaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    parts.push(`subtitles=${escaped}`);
  }
  return parts.join(",");
}
