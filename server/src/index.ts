import cors from "cors";
import express from "express";
import fs from "node:fs";
import { config } from "./config.js";
import { jobsRouter } from "./routes/jobs.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

fs.mkdirSync(config.workspaceDir, { recursive: true });

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    whisperModel: config.whisperModel,
    selector: config.anthropicApiKey ? "claude" : "heuristic",
    model: config.anthropicApiKey ? config.anthropicModel : null,
  });
});

app.use("/api/jobs", jobsRouter);

app.listen(config.port, () => {
  console.log(`reelay server listening on http://localhost:${config.port}`);
  console.log(
    `  highlight selector: ${config.anthropicApiKey ? `claude (${config.anthropicModel})` : "heuristic (set ANTHROPIC_API_KEY for Claude)"}`,
  );
  console.log(`  whisper model: ${config.whisperModel}`);
  console.log(`  workspace: ${config.workspaceDir}`);
});
