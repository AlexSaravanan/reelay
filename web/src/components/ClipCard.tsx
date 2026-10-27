import { useState } from "react";
import { fileUrl, retrimClip } from "../api.ts";
import type { Clip } from "../types.ts";

export function ClipCard({
  jobId,
  clip,
  selected,
  onToggleSelect,
  onUpdate,
}: {
  jobId: string;
  clip: Clip;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdate: (clip: Clip) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [startStr, setStartStr] = useState(fmt(clip.start));
  const [endStr, setEndStr] = useState(fmt(clip.end));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const openEditor = () => {
    setStartStr(fmt(clip.start));
    setEndStr(fmt(clip.end));
    setErr(null);
    setEditing(true);
  };

  const apply = async () => {
    const start = parseTime(startStr);
    const end = parseTime(endStr);
    if (start === null || end === null) {
      setErr("Use m:ss (e.g. 1:33) or seconds.");
      return;
    }
    if (end - start < 0.5) {
      setErr("End must be after start.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const updated = await retrimClip(jobId, clip.id, { start, end });
      onUpdate(updated);
      setPlaying(false); // force the new render to load
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

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
        {editing ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                placeholder="0:06"
                className="w-16 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-center text-xs tabular-nums outline-none focus:border-violet-400/60"
              />
              <span className="text-white/40">→</span>
              <input
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                placeholder="1:33"
                className="w-16 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-center text-xs tabular-nums outline-none focus:border-violet-400/60"
              />
              <div className="ml-auto flex gap-1">
                <button
                  onClick={apply}
                  disabled={saving}
                  className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {saving ? "…" : "Apply"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
            {saving && (
              <p className="text-xs text-white/40">Re-rendering clip…</p>
            )}
            {err && <p className="text-xs text-red-300">{err}</p>}
          </div>
        ) : (
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={openEditor}
              title="Edit start / end times"
              className="group/edit flex items-center gap-1 text-xs tabular-nums text-white/40 hover:text-white/80"
            >
              {fmt(clip.start)} → {fmt(clip.end)}
              <span className="opacity-0 transition group-hover/edit:opacity-100">
                ✎
              </span>
            </button>
            <a
              href={fileUrl(jobId, clip.file, true)}
              className="rounded-lg bg-white/10 px-3 py-1 text-xs font-medium hover:bg-white/20"
            >
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/** Parse "m:ss", "m:ss.s" or a plain seconds number to seconds; null if bad. */
function parseTime(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  if (s.includes(":")) {
    const parts = s.split(":");
    if (parts.length !== 2) return null;
    const m = Number(parts[0]);
    const sec = Number(parts[1]);
    if (!Number.isFinite(m) || !Number.isFinite(sec) || sec < 0 || sec >= 60) {
      return null;
    }
    return m * 60 + sec;
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
