import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { run } from "./proc.js";

/** True when the Piper binary and its voice model are both present. */
export function ttsAvailable(): boolean {
  return existsSync(config.piperBin) && existsSync(config.piperVoice);
}

/**
 * Synthesize `text` to a WAV at `outWav` with Piper (local, offline neural TTS).
 * The text is written to a file and passed with -i to avoid stdin/quoting.
 */
export async function synthesize(
  text: string,
  outWav: string,
  dir: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!ttsAvailable()) {
    throw new Error(
      "AI voice (Piper) is not installed. Run scripts/setup-python.sh to fetch " +
        "the voice model, or set PIPER_BIN / PIPER_VOICE.",
    );
  }
  const txtPath = path.join(dir, "narration.txt");
  await fs.writeFile(txtPath, text, "utf-8");
  await run(
    config.piperBin,
    ["-m", config.piperVoice, "-i", txtPath, "-f", outWav],
    { signal },
  );
}
