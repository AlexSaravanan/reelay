import type {
  AspectRatio,
  Health,
  Job,
  JobStage,
  VideoQuality,
} from "./types.ts";

export interface CreateJobInput {
  url: string;
  clipCount: number;
  minDuration: number;
  maxDuration: number;
  captions: boolean;
  quality: VideoQuality;
  aspect: AspectRatio;
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export async function cancelJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}/cancel`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Cancel failed (${res.status})`);
  }
  return res.json();
}

export async function listJobs(): Promise<Job[]> {
  const res = await fetch("/api/jobs");
  if (!res.ok) throw new Error("Failed to load jobs");
  return res.json();
}

export async function getHealth(): Promise<Health> {
  const res = await fetch("/api/health");
  return res.json();
}

export interface ProgressEvent {
  jobId: string;
  stage: JobStage;
  progress: number;
  message: string;
  clips?: Job["clips"];
  error?: string;
}

/** Subscribe to a job's progress via SSE. Returns an unsubscribe function. */
export function subscribeJob(
  jobId: string,
  onEvent: (e: ProgressEvent) => void,
): () => void {
  const es = new EventSource(`/api/jobs/${jobId}/events`);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch {
      // ignore malformed frames
    }
  };
  es.onerror = () => es.close();
  return () => es.close();
}

export function fileUrl(jobId: string, file: string, download = false): string {
  const q = download ? "?download" : "";
  return `/api/jobs/${jobId}/file/${file}${q}`;
}

/** Trigger browser downloads for several clip files, one after another. */
export async function downloadFiles(
  jobId: string,
  files: string[],
): Promise<void> {
  for (const file of files) {
    const a = document.createElement("a");
    a.href = fileUrl(jobId, file, true);
    a.download = file.split("/").pop() ?? "clip.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Small gap so the browser doesn't drop rapid successive downloads.
    await new Promise((r) => setTimeout(r, 400));
  }
}
