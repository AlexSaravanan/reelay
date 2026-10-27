import { useEffect, useRef, useState } from "react";
import {
  cancelJob,
  createJob,
  downloadFiles,
  getHealth,
  listJobs,
  subscribeJob,
  type ProgressEvent,
} from "./api.ts";
import { ClipCard } from "./components/ClipCard.tsx";
import { JobProgress } from "./components/JobProgress.tsx";
import { NewJobForm, type JobFormValues } from "./components/NewJobForm.tsx";
import type { Health, Job } from "./types.ts";

export function App() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
    listJobs()
      .then((js) => {
        setJobs(js);
        if (js.length) setActiveId((id) => id ?? js[0].id);
      })
      .catch(() => {});
  }, []);

  // Subscribe to the active job's progress stream.
  useEffect(() => {
    unsubRef.current?.();
    if (!activeId) return;
    const active = jobs.find((j) => j.id === activeId);
    if (active && (active.stage === "done" || active.stage === "error")) return;

    unsubRef.current = subscribeJob(activeId, (e: ProgressEvent) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === e.jobId
            ? {
                ...j,
                stage: e.stage,
                progress: e.progress,
                message: e.message,
                clips: e.clips ?? j.clips,
                error: e.error,
              }
            : j,
        ),
      );
    });
    return () => unsubRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const handleSubmit = async (values: JobFormValues) => {
    if (values.maxDuration < values.minDuration) {
      setError("Max seconds must be at least Min seconds.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const job = await createJob(values);
      setJobs((prev) => [job, ...prev]);
      setActiveId(job.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (id: string) => {
    // Optimistically reflect the cancel; the SSE event confirms it.
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? { ...j, stage: "cancelled", message: "Cancelling…" }
          : j,
      ),
    );
    try {
      await cancelJob(id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleClipUpdate = (jobId: string, clip: Job["clips"][number]) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? { ...j, clips: j.clips.map((c) => (c.id === clip.id ? clip : c)) }
          : j,
      ),
    );
  };

  const active = jobs.find((j) => j.id === activeId) ?? null;

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <Header health={health} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <NewJobForm onSubmit={handleSubmit} busy={busy} />
          {error && (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </p>
          )}
          <JobList jobs={jobs} activeId={activeId} onSelect={setActiveId} />
        </div>

        <div>
          {active ? (
            <ActiveJob
              job={active}
              onCancel={handleCancel}
              onClipUpdate={handleClipUpdate}
            />
          ) : (
            <Empty />
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ health }: { health: Health | null }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-3xl font-black tracking-tight text-transparent">
          Reelay
        </h1>
        <p className="text-sm text-white/50">
          Turn long videos into short, captioned vertical clips.
        </p>
      </div>
      {health && (
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-white/5 px-3 py-1 text-white/60">
            whisper: {health.whisperModel}
          </span>
          <span
            className={`rounded-full px-3 py-1 ${
              health.selector === "claude"
                ? "bg-violet-500/20 text-violet-200"
                : "bg-white/5 text-white/60"
            }`}
          >
            {health.selector === "claude"
              ? `AI: ${health.model}`
              : "AI: heuristic"}
          </span>
        </div>
      )}
    </header>
  );
}

const RUNNING_STAGES = new Set<Job["stage"]>([
  "queued",
  "ingesting",
  "transcribing",
  "selecting",
  "rendering",
]);

function ActiveJob({
  job,
  onCancel,
  onClipUpdate,
}: {
  job: Job;
  onCancel: (id: string) => void;
  onClipUpdate: (jobId: string, clip: Job["clips"][number]) => void;
}) {
  const running = RUNNING_STAGES.has(job.stage);
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-white/90">
            {job.source.title ?? job.source.value}
          </h2>
          <a
            href={job.source.value}
            target="_blank"
            rel="noreferrer"
            className="break-all text-xs text-white/40 hover:text-white/60"
          >
            {job.source.value}
          </a>
        </div>
        {running && (
          <button
            onClick={() => onCancel(job.id)}
            className="shrink-0 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20"
          >
            Cancel
          </button>
        )}
      </div>

      <JobProgress job={job} />

      {job.clips.length > 0 && (
        <ClipGallery job={job} onClipUpdate={onClipUpdate} />
      )}
    </div>
  );
}

function ClipGallery({
  job,
  onClipUpdate,
}: {
  job: Job;
  onClipUpdate: (jobId: string, clip: Job["clips"][number]) => void;
}) {
  // Preview clips, pick the ones you like, then download just those (or all).
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allSelected = selected.size === job.clips.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(job.clips.map((c) => c.id)));

  const downloadSelected = () => {
    const files = job.clips
      .filter((c) => selected.has(c.id))
      .map((c) => c.file);
    if (files.length) void downloadFiles(job.id, files);
  };
  const downloadAll = () =>
    void downloadFiles(job.id, job.clips.map((c) => c.file));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-white/80">
            {job.clips.length} clip{job.clips.length === 1 ? "" : "s"}
          </h3>
          {job.selector && (
            <span className="text-xs text-white/40">
              picked by {job.selector}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleAll}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
          >
            {allSelected ? "Clear" : "Select all"}
          </button>
          <button
            onClick={downloadSelected}
            disabled={selected.size === 0}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Download selected{selected.size ? ` (${selected.size})` : ""}
          </button>
          <button
            onClick={downloadAll}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10"
          >
            Download all
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-white/40">
        Tip: click a clip to preview it. Tick the ones you want, then download.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {job.clips.map((clip) => (
          <ClipCard
            key={clip.id}
            jobId={job.id}
            clip={clip}
            selected={selected.has(clip.id)}
            onToggleSelect={toggle}
            onUpdate={(c) => onClipUpdate(job.id, c)}
          />
        ))}
      </div>
    </div>
  );
}

function JobList({
  jobs,
  activeId,
  onSelect,
}: {
  jobs: Job[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-2">
      <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-white/40">
        Recent
      </p>
      <ul className="space-y-1">
        {jobs.map((j) => (
          <li key={j.id}>
            <button
              onClick={() => onSelect(j.id)}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                j.id === activeId ? "bg-white/10" : "hover:bg-white/5"
              }`}
            >
              <span className="truncate text-white/80">
                {j.source.title ?? j.source.value}
              </span>
              <StatusDot job={j} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusDot({ job }: { job: Job }) {
  const color =
    job.stage === "done"
      ? "bg-emerald-400"
      : job.stage === "error"
        ? "bg-red-400"
        : job.stage === "cancelled"
          ? "bg-amber-400"
          : "bg-fuchsia-400 animate-pulse";
  return <span className={`ml-2 h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function Empty() {
  return (
    <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-white/40">
      <div>
        <p className="text-lg">Paste a video URL to get started.</p>
        <p className="mt-1 text-sm">
          Reelay downloads it, transcribes it, finds the best moments, and cuts
          captioned vertical clips.
        </p>
      </div>
    </div>
  );
}
