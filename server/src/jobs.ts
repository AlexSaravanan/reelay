import { EventEmitter } from "node:events";
import type { Job, JobEvent, JobStage } from "./types.js";

/** In-memory job registry with an event bus for live progress (SSE). */
const TERMINAL: JobStage[] = ["done", "error", "cancelled"];

class JobStore {
  private jobs = new Map<string, Job>();
  private controllers = new Map<string, AbortController>();
  private bus = new EventEmitter();

  constructor() {
    // Many SSE clients may listen on the same job.
    this.bus.setMaxListeners(0);
  }

  create(job: Job): void {
    this.jobs.set(job.id, job);
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Patch a job and broadcast the change to subscribers. */
  update(
    id: string,
    patch: Partial<Pick<Job, "stage" | "progress" | "message" | "clips" | "error" | "transcript" | "selector">>,
  ): void {
    const job = this.jobs.get(id);
    if (!job) return;
    Object.assign(job, patch);
    const event: JobEvent = {
      jobId: id,
      stage: job.stage,
      progress: job.progress,
      message: job.message,
      clips: job.clips,
      error: job.error,
    };
    this.bus.emit(id, event);
    this.bus.emit("*", job);
  }

  setStage(id: string, stage: JobStage, progress: number, message: string): void {
    this.update(id, { stage, progress, message });
  }

  subscribe(id: string, listener: (e: JobEvent) => void): () => void {
    this.bus.on(id, listener);
    return () => this.bus.off(id, listener);
  }

  /** Register the AbortController driving a job's pipeline. */
  attachController(id: string, controller: AbortController): void {
    this.controllers.set(id, controller);
  }

  releaseController(id: string): void {
    this.controllers.delete(id);
  }

  /**
   * Cancel a running job: abort its child processes and mark it cancelled.
   * Returns false if the job is missing or already finished.
   */
  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || TERMINAL.includes(job.stage)) return false;
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.update(id, {
      stage: "cancelled",
      progress: 100,
      message: "Cancelled.",
    });
    return true;
  }
}

export const jobs = new JobStore();
