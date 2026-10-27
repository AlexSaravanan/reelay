#!/usr/bin/env node
// Quick environment check for reelay's external tools.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function check(name, bin, args) {
  try {
    const { stdout, stderr } = await run(bin, args);
    const v = (stdout || stderr).split("\n")[0].trim();
    console.log(`  ok   ${name.padEnd(16)} ${v}`);
    return true;
  } catch {
    console.log(`  MISS ${name.padEnd(16)} not found (${bin})`);
    return false;
  }
}

console.log("reelay doctor\n");

const ffmpeg = process.env.FFMPEG_BIN ?? "ffmpeg";
const ffprobe = process.env.FFPROBE_BIN ?? "ffprobe";
const ytdlp = process.env.YTDLP_BIN ?? "yt-dlp";
const python = process.env.PYTHON_BIN ?? path.join(root, ".venv", "bin", "python");

await check("ffmpeg", ffmpeg, ["-version"]);
await check("ffprobe", ffprobe, ["-version"]);
await check("yt-dlp", ytdlp, ["--version"]);

if (existsSync(python)) {
  await check("python", python, ["--version"]);
  try {
    await run(python, ["-c", "import faster_whisper"]);
    console.log("  ok   faster-whisper   importable");
  } catch {
    console.log("  MISS faster-whisper   run: scripts/setup-python.sh");
  }
} else {
  console.log(`  MISS python           venv missing at ${python}`);
  console.log("       run: scripts/setup-python.sh");
}

console.log(
  `\n  AI selector: ${process.env.ANTHROPIC_API_KEY ? "claude (key set)" : "heuristic (set ANTHROPIC_API_KEY for Claude)"}`,
);
