import { jobDir } from "../config.js";
import { jobs } from "../jobs.js";
import type { Job } from "../types.js";
import { probe } from "./ffmpeg.js";
import { selectHighlights } from "./highlights.js";
import { ingest } from "./ingest.js";
import { CancelledError } from "./proc.js";
import { renderClips } from "./render.js";
import { transcribe } from "./transcribe.js";

/**
 * Full pipeline for one job. Each stage owns a slice of the 0-100 bar:
 *   ingest 0-20, transcribe 20-55, select 55-60, render 60-100.
 */
export async function runJob(job: Job): Promise<void> {
  const dir = jobDir(job.id);
  const controller = new AbortController();
  const { signal } = controller;
  jobs.attachController(job.id, controller);

  try {
    // 1. Ingest -------------------------------------------------------------
    jobs.setStage(job.id, "ingesting", 0, "Fetching video…");
    const { videoPath, title } = await ingest(
      job.source,
      dir,
      job.options.quality,
      (pct, msg) => jobs.setStage(job.id, "ingesting", scale(pct, 0, 20), msg),
      signal,
    );
    job.source.title = title;

    const info = await probe(videoPath);

    // 2. Transcribe ---------------------------------------------------------
    jobs.setStage(job.id, "transcribing", 20, "Transcribing audio…");
    const transcript = await transcribe(
      videoPath,
      dir,
      info.duration,
      (pct, msg) =>
        jobs.setStage(job.id, "transcribing", scale(pct, 20, 55), msg),
      signal,
    );
    jobs.update(job.id, { transcript });

    // 3. Select highlights --------------------------------------------------
    jobs.setStage(job.id, "selecting", 56, "Finding the best moments…");
    const { highlights, selector } = await selectHighlights(
      transcript,
      job.options,
    );
    jobs.update(job.id, { selector });
    if (highlights.length === 0) {
      throw new Error(
        "No suitable clips were found. Try a longer video or wider duration range.",
      );
    }
    jobs.setStage(
      job.id,
      "selecting",
      60,
      `Found ${highlights.length} moments (${selector}). Rendering…`,
    );

    // 4. Render -------------------------------------------------------------
    jobs.setStage(job.id, "rendering", 60, "Rendering clips…");
    const clips = await renderClips(
      videoPath,
      dir,
      transcript,
      highlights,
      job.options.captions,
      job.options.aspect,
      (pct, msg) =>
        jobs.update(job.id, {
          stage: "rendering",
          progress: scale(pct, 60, 100),
          message: msg,
        }),
      signal,
    );

    jobs.update(job.id, {
      stage: "done",
      progress: 100,
      message: `Done — ${clips.length} clips ready.`,
      clips,
    });
  } catch (err) {
    // A cancellation (manual abort) is not an error — jobs.cancel already set
    // the terminal "cancelled" state, so leave it alone.
    if (err instanceof CancelledError || signal.aborted) {
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    jobs.update(job.id, {
      stage: "error",
      progress: 100,
      message: "Something went wrong.",
      error: message,
    });
  } finally {
    jobs.releaseController(job.id);
  }
}

/** Map a 0-100 stage-local percent into a global [lo, hi] slice. */
function scale(pct: number, lo: number, hi: number): number {
  return Math.round(lo + (Math.max(0, Math.min(100, pct)) / 100) * (hi - lo));
}
