import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { scriptProvider } from "./pipeline/explainer.js";
import { ttsAvailable } from "./pipeline/tts.js";
import { jobsRouter } from "./routes/jobs.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

fs.mkdirSync(config.workspaceDir, { recursive: true });

// Hosts like Hugging Face Spaces expose secrets as env vars, not files — so
// accept yt-dlp cookies as base64 and materialize them to a file yt-dlp can use.
if (process.env.YTDLP_COOKIES_B64 && !process.env.YTDLP_COOKIES) {
  try {
    const cookiePath = path.join(config.workspaceDir, ".cookies.txt");
    fs.writeFileSync(
      cookiePath,
      Buffer.from(process.env.YTDLP_COOKIES_B64, "base64").toString("utf-8"),
      { mode: 0o600 },
    );
    process.env.YTDLP_COOKIES = cookiePath;
    console.log("Loaded yt-dlp cookies from YTDLP_COOKIES_B64.");
  } catch (err) {
    console.warn("Failed to decode YTDLP_COOKIES_B64:", (err as Error).message);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    whisperModel: config.whisperModel,
    selector: config.anthropicApiKey ? "claude" : "heuristic",
    model: config.anthropicApiKey ? config.anthropicModel : null,
    // Explainer mode needs a script LLM (Claude or Gemini) and the Piper voice.
    explainer: scriptProvider() !== null && ttsAvailable(),
  });
});

app.use("/api/jobs", jobsRouter);

// In production, serve the built frontend from the same origin so the app's
// relative /api calls work without a separate host or proxy.
const webDist = path.join(config.repoRoot, "web", "dist");
if (fs.existsSync(path.join(webDist, "index.html"))) {
  app.use(express.static(webDist));
  // SPA fallback for any non-API route.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(config.port, "0.0.0.0", () => {
  console.log(`reelay server listening on http://localhost:${config.port}`);
  console.log(
    `  highlight selector: ${config.anthropicApiKey ? `claude (${config.anthropicModel})` : "heuristic (set ANTHROPIC_API_KEY for Claude)"}`,
  );
  console.log(`  whisper model: ${config.whisperModel}`);
  console.log(`  workspace: ${config.workspaceDir}`);
});
