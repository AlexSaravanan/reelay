import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import type { Clip } from "../types.js";
import { probe } from "./ffmpeg.js";
import { run } from "./proc.js";

/**
 * Replace the source video's audio with the narration WAV and return it as a
 * single clip. `-shortest` ends the output with the (shorter) narration, so the
 * original audio is dropped entirely and the length tracks the voiceover.
 */
export async function narrateVideo(
  videoPath: string,
  narrationWav: string,
  dir: string,
  title: string,
  signal?: AbortSignal,
): Promise<Clip> {
  const clipsDir = path.join(dir, "clips");
  await fs.mkdir(clipsDir, { recursive: true });
  const base = `explainer-${nanoid(6)}`;
  const outFile = path.join(clipsDir, `${base}.mp4`);
  const thumbFile = path.join(clipsDir, `${base}.jpg`);

  // Cap the output at the narration length. `-shortest` with `-c:v copy`
  // overshoots to the next keyframe, so bound it explicitly with `-t`.
  const narrDur = (await probe(narrationWav)).duration;

  await run(
    config.ffmpegBin,
    [
      "-y",
      "-i",
      videoPath,
      "-i",
      narrationWav,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-t",
      narrDur.toFixed(3),
      "-movflags",
      "+faststart",
      outFile,
    ],
    { signal },
  );

  const info = await probe(outFile);
  await run(
    config.ffmpegBin,
    [
      "-y",
      "-ss",
      Math.max(0, info.duration / 2).toFixed(3),
      "-i",
      outFile,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      thumbFile,
    ],
    { signal },
  );

  return {
    start: 0,
    end: Math.round(info.duration),
    title,
    reason: "AI explainer voiceover — script researched from the web.",
    score: 100,
    id: nanoid(8),
    file: `clips/${base}.mp4`,
    thumbnail: `clips/${base}.jpg`,
    durationSec: Math.round(info.duration),
  };
}
