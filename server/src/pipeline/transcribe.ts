import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { Transcript } from "../types.js";
import { extractAudio } from "./ffmpeg.js";
import { run } from "./proc.js";

/**
 * Transcribe a video: extract audio, then run the faster-whisper helper.
 * Reports progress 0-100 as whisper walks through the timeline.
 */
export async function transcribe(
  videoPath: string,
  dir: string,
  duration: number,
  onProgress: (pct: number, msg: string) => void,
  signal?: AbortSignal,
): Promise<Transcript> {
  const wav = path.join(dir, "audio.wav");
  onProgress(2, "Extracting audio…");
  await extractAudio(videoPath, wav, signal);

  const outJson = path.join(dir, "transcript.json");
  onProgress(5, `Transcribing with Whisper (${config.whisperModel})…`);

  await run(
    config.pythonBin,
    [
      config.transcribeScript,
      wav,
      outJson,
      "--model",
      config.whisperModel,
    ],
    {
      signal,
      onStderr: (chunk) => {
        for (const line of chunk.split("\n")) {
          const m = line.match(/PROGRESS\s+([\d.]+)\/([\d.]+)/);
          if (m) {
            const done = parseFloat(m[1]);
            const total = parseFloat(m[2]) || duration || 1;
            const pct = Math.min(99, (done / total) * 100);
            onProgress(pct, `Transcribing… ${Math.round(pct)}%`);
          }
        }
      },
    },
  );

  const raw = await fs.readFile(outJson, "utf-8");
  return JSON.parse(raw) as Transcript;
}
