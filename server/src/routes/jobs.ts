import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { config, jobDir } from "../config.js";
import { jobs } from "../jobs.js";
import { probe } from "../pipeline/ffmpeg.js";
import { renderClipRange } from "../pipeline/render.js";
import { runJob } from "../pipeline/run.js";
import type { AspectRatio, Job, JobOptions, VideoQuality } from "../types.js";

const QUALITIES: VideoQuality[] = ["max", "1080", "720", "480"];
const ASPECTS: AspectRatio[] = ["9:16", "4:3", "1:1", "16:9"];

export const jobsRouter = Router();

function parseOptions(body: Record<string, unknown>): JobOptions {
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
  };
  const quality = QUALITIES.includes(body.quality as VideoQuality)
    ? (body.quality as VideoQuality)
    : "1080";
  const aspect = ASPECTS.includes(body.aspect as AspectRatio)
    ? (body.aspect as AspectRatio)
    : "9:16";
  return {
    clipCount: clamp(body.clipCount, 1, 12, 5),
    minDuration: clamp(body.minDuration, 5, 120, 20),
    maxDuration: clamp(body.maxDuration, 10, 180, 60),
    captions: body.captions !== false,
    quality,
    aspect,
  };
}

// POST /api/jobs — start a job from a URL.
jobsRouter.post("/", (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: "A valid http(s) video URL is required." });
  }
  const options = parseOptions(req.body ?? {});
  if (options.maxDuration < options.minDuration) {
    return res.status(400).json({ error: "maxDuration must be >= minDuration." });
  }

  const job: Job = {
    id: nanoid(10),
    createdAt: Date.now(),
    source: { kind: "url", value: url },
    options,
    stage: "queued",
    progress: 0,
    message: "Queued…",
    clips: [],
  };

  fs.mkdirSync(jobDir(job.id), { recursive: true });
  jobs.create(job);

  // Fire and forget; progress is observed via SSE/polling.
  void runJob(job);

  res.status(201).json(publicJob(job));
});

// GET /api/jobs — list all jobs (newest first).
jobsRouter.get("/", (_req, res) => {
  res.json(jobs.list().map(publicJob));
});

// GET /api/jobs/:id — one job, with transcript omitted for size.
jobsRouter.get("/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(publicJob(job));
});

// POST /api/jobs/:id/cancel — stop a running job.
jobsRouter.post("/:id/cancel", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  const cancelled = jobs.cancel(req.params.id);
  if (!cancelled) {
    return res
      .status(409)
      .json({ error: "Job already finished; nothing to cancel." });
  }
  res.json(publicJob(jobs.get(req.params.id)!));
});

// POST /api/jobs/:id/clips/:clipId/retrim — re-render one clip over a new
// [start, end] range (seconds, absolute in the source video).
jobsRouter.post("/:id/clips/:clipId/retrim", async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  const clip = job.clips.find((c) => c.id === req.params.clipId);
  if (!clip) return res.status(404).json({ error: "Clip not found." });
  if (!job.transcript) {
    return res
      .status(409)
      .json({ error: "This job's data is no longer available; start a new job." });
  }

  const start = Number(req.body?.start);
  const end = Number(req.body?.end);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end <= start
  ) {
    return res
      .status(400)
      .json({ error: "Provide start and end seconds with end greater than start." });
  }

  // Locate the downloaded source video.
  const dir = jobDir(job.id);
  let source: string | undefined;
  try {
    source = fs.readdirSync(dir).find((f) => f.startsWith("source."));
  } catch {
    // fall through to the missing-source error below
  }
  if (!source) {
    return res.status(409).json({ error: "Source video is no longer available." });
  }
  const videoPath = path.join(dir, source);

  // Clamp the end to the real video duration so we never seek past it.
  const info = await probe(videoPath);
  const end2 = info.duration ? Math.min(end, info.duration) : end;
  if (end2 - start < 0.5) {
    return res.status(400).json({ error: "Range is too short or outside the video." });
  }

  try {
    const out = await renderClipRange(
      videoPath,
      dir,
      job.transcript,
      start,
      end2,
      job.options.captions,
      job.options.aspect,
    );
    Object.assign(clip, { start, end: end2, ...out });
    const title = req.body?.title;
    if (typeof title === "string" && title.trim()) clip.title = title.trim();
    jobs.update(job.id, { clips: job.clips });
    res.json(clip);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/jobs/:id/events — Server-Sent Events stream of progress.
jobsRouter.get("/:id/events", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Send current state immediately, then stream updates.
  send({
    jobId: job.id,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    clips: job.clips,
    error: job.error,
  });

  const unsubscribe = jobs.subscribe(job.id, (event) => {
    send(event);
    if (
      event.stage === "done" ||
      event.stage === "error" ||
      event.stage === "cancelled"
    ) {
      res.end();
    }
  });

  req.on("close", unsubscribe);
});

// GET /api/jobs/:id/file/* — serve a rendered clip or thumbnail from the job dir.
jobsRouter.get("/:id/file/*", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();

  const rel = (req.params as Record<string, string>)[0] ?? "";
  const dir = jobDir(job.id);
  const target = path.resolve(dir, rel);

  // Prevent path traversal outside the job directory.
  if (!target.startsWith(path.resolve(dir) + path.sep)) {
    return res.status(400).end();
  }
  if (!fs.existsSync(target)) return res.status(404).end();

  if (req.query.download !== undefined) {
    return res.download(target);
  }
  res.sendFile(target);
});

/** Strip the heavy transcript from API responses. */
function publicJob(job: Job) {
  const { transcript, ...rest } = job;
  return { ...rest, hasTranscript: Boolean(transcript) };
}
