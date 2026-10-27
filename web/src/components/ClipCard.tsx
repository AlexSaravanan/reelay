import { useState } from "react";
import { fileUrl } from "../api.ts";
import type { Clip } from "../types.ts";

export function ClipCard({
  jobId,
  clip,
  selected,
  onToggleSelect,
}: {
  jobId: string;
  clip: Clip;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className={`group overflow-hidden rounded-2xl border bg-white/5 transition ${
        selected ? "border-violet-400 ring-2 ring-violet-400/50" : "border-white/10"
      }`}
    >
      <div className="relative aspect-[9/16] bg-black">
        {/* Selection checkbox */}
        <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(clip.id)}
            className="h-5 w-5 cursor-pointer accent-violet-500"
            title="Select for download"
          />
        </label>
        {playing ? (
          <video
            src={fileUrl(jobId, clip.file)}
            controls
            autoPlay
            className="h-full w-full object-contain"
          />
        ) : (
          <button
            onClick={() => setPlaying(true)}
            className="relative h-full w-full"
          >
            {clip.thumbnail ? (
              <img
                src={fileUrl(jobId, clip.thumbnail)}
                alt={clip.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-white/30">
                no preview
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-2xl backdrop-blur transition group-hover:scale-110">
                ▶
              </span>
            </span>
            <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-xs tabular-nums">
              {clip.durationSec}s
            </span>
            <span className="absolute bottom-2 left-2 rounded-md bg-violet-600/80 px-2 py-0.5 text-xs font-semibold">
              {clip.score}
            </span>
          </button>
        )}
      </div>

      <div className="p-3">
        <h4 className="line-clamp-2 text-sm font-semibold text-white/90">
          {clip.title}
        </h4>
        {clip.reason && (
          <p className="mt-1 line-clamp-2 text-xs text-white/50">{clip.reason}</p>
        )}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs tabular-nums text-white/40">
            {fmt(clip.start)} → {fmt(clip.end)}
          </span>
          <a
            href={fileUrl(jobId, clip.file, true)}
            className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20"
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
