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
  // Free alternative for the explainer script (Google Gemini, free tier with
  // Search grounding). Used when there's no Anthropic key.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  // "…-latest" alias stays current; pinned versions 404 for newer free keys.
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
  ytdlpBin: process.env.YTDLP_BIN ?? "yt-dlp",
  ffmpegBin: process.env.FFMPEG_BIN ?? "ffmpeg",
  ffprobeBin: process.env.FFPROBE_BIN ?? "ffprobe",
  // Piper TTS (AI voiceover for explainer mode).
  piperBin: process.env.PIPER_BIN ?? path.join(repoRoot, ".venv", "bin", "piper"),
  piperVoice:
    process.env.PIPER_VOICE ??
    path.join(repoRoot, "voices", "en_US-lessac-medium.onnx"),
  /** Hard cap on explainer output length (seconds). */
  explainerMaxSeconds: Number(process.env.EXPLAINER_MAX_SECONDS ?? 600),
};

export function jobDir(jobId: string): string {
  return path.join(config.workspaceDir, jobId);
}
