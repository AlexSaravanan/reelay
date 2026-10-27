import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src -> repo root is two levels up from dist/ or src/.
const repoRoot = path.resolve(__dirname, "..", "..");

export const config = {
  port: Number(process.env.PORT ?? 5174),
  workspaceDir:
    process.env.WORKSPACE_DIR ?? path.join(repoRoot, "workspace"),
  repoRoot,
  whisperModel: process.env.WHISPER_MODEL ?? "small",
  pythonBin:
    process.env.PYTHON_BIN ?? path.join(repoRoot, ".venv", "bin", "python"),
  transcribeScript: path.join(repoRoot, "scripts", "transcribe.py"),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  ytdlpBin: process.env.YTDLP_BIN ?? "yt-dlp",
  ffmpegBin: process.env.FFMPEG_BIN ?? "ffmpeg",
  ffprobeBin: process.env.FFPROBE_BIN ?? "ffprobe",
};

export function jobDir(jobId: string): string {
  return path.join(config.workspaceDir, jobId);
}
