import type { Job, JobStage } from "../types.ts";

const STAGES: { key: JobStage; label: string }[] = [
  { key: "ingesting", label: "Download" },
  { key: "transcribing", label: "Transcribe" },
  { key: "selecting", label: "Select" },
  { key: "rendering", label: "Render" },
  { key: "done", label: "Done" },
];

const ORDER: JobStage[] = [
  "queued",
  "ingesting",
  "transcribing",
  "selecting",
  "rendering",
  "done",
];

export function JobProgress({ job }: { job: Job }) {
  const currentIdx = ORDER.indexOf(job.stage);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-white/80">{job.message}</span>
        <span className="text-sm tabular-nums text-white/50">
          {job.progress}%
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-black/50">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            job.stage === "error"
              ? "bg-red-500"
              : job.stage === "cancelled"
                ? "bg-amber-500"
                : "bg-gradient-to-r from-violet-500 to-fuchsia-400"
          }`}
          style={{ width: `${job.progress}%` }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STAGES.map((s) => {
          const idx = ORDER.indexOf(s.key);
          const state =
            job.stage === "error" || job.stage === "cancelled"
              ? idx < currentIdx
                ? "done"
                : "idle"
              : idx < currentIdx || job.stage === "done"
                ? "done"
                : idx === currentIdx
                  ? "active"
                  : "idle";
          return (
            <span
              key={s.key}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                state === "done"
                  ? "bg-violet-500/20 text-violet-200"
                  : state === "active"
                    ? "bg-fuchsia-500/20 text-fuchsia-200 ring-1 ring-fuchsia-400/40"
                    : "bg-white/5 text-white/30"
              }`}
            >
              {s.label}
            </span>
          );
        })}
      </div>

      {job.error && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {job.error}
        </p>
      )}
    </div>
  );
}
