import { useState } from "react";
import type { AspectRatio, JobMode, VideoQuality } from "../types.ts";

export interface JobFormValues {
  url: string;
  mode: JobMode;
  clipCount: number;
  minDuration: number;
  maxDuration: number;
  captions: boolean;
  quality: VideoQuality;
  aspect: AspectRatio;
}

// Output frame options. "box" is the on-screen preview proportions for the chip.
const ASPECT_OPTIONS: {
  value: AspectRatio;
  label: string;
  hint: string;
  box: string;
}[] = [
  { value: "9:16", label: "9:16", hint: "Shorts / Reels", box: "h-7 w-4" },
  { value: "4:3", label: "4:3", hint: "Classic", box: "h-5 w-[26px]" },
  { value: "1:1", label: "1:1", hint: "Square", box: "h-6 w-6" },
  { value: "16:9", label: "16:9", hint: "Widescreen", box: "h-4 w-7" },
];

const QUALITY_OPTIONS: { value: VideoQuality; label: string }[] = [
  { value: "max", label: "Max available" },
  { value: "1080", label: "1080p" },
  { value: "720", label: "720p (faster)" },
  { value: "480", label: "480p (smallest)" },
];

// One-tap clip-length presets. They just set the min/max duration fields, which
// stay editable afterwards for fine-tuning.
const LENGTH_PRESETS: {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  { id: "shorts", label: "Shorts", hint: "15–60s", min: 15, max: 60 },
  { id: "mid", label: "Clips", hint: "1–2 min", min: 60, max: 120 },
  { id: "long", label: "Long", hint: "2–3 min", min: 120, max: 180 },
];

interface Props {
  onSubmit: (values: JobFormValues) => void;
  busy: boolean;
  /** Whether the server can run explainer mode (Claude key + Piper voice). */
  explainerReady: boolean;
}

export function NewJobForm({ onSubmit, busy, explainerReady }: Props) {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<JobMode>("clips");
  const [clipCount, setClipCount] = useState(5);
  const [minDuration, setMinDuration] = useState(15);
  const [maxDuration, setMaxDuration] = useState(60);
  const [captions, setCaptions] = useState(true);
  const [quality, setQuality] = useState<VideoQuality>("1080");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const explainer = mode === "explainer";

  const applyPreset = (min: number, max: number) => {
    setMinDuration(min);
    setMaxDuration(max);
  };
  const activePreset = LENGTH_PRESETS.find(
    (p) => p.min === minDuration && p.max === maxDuration,
  )?.id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      url: url.trim(),
      mode,
      clipCount,
      minDuration,
      maxDuration,
      captions,
      quality,
      aspect,
    });
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
    >
      <label className="mb-1 block text-sm font-medium text-white/70">
        Video URL
      </label>
      <input
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=…"
        className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/30 focus:border-violet-400/60"
      />

      {/* Mode: short clips vs. AI explainer */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("clips")}
          className={`rounded-xl border px-3 py-2 text-left transition ${
            !explainer
              ? "border-violet-400/60 bg-violet-500/20 text-white"
              : "border-white/10 bg-black/40 text-white/70 hover:bg-white/10"
          }`}
        >
          <span className="block text-sm font-semibold">✂️ Clips</span>
          <span className="block text-[11px] text-white/40">
            Highlight reels
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("explainer")}
          className={`rounded-xl border px-3 py-2 text-left transition ${
            explainer
              ? "border-violet-400/60 bg-violet-500/20 text-white"
              : "border-white/10 bg-black/40 text-white/70 hover:bg-white/10"
          }`}
        >
          <span className="block text-sm font-semibold">🎙️ AI Explainer</span>
          <span className="block text-[11px] text-white/40">
            New AI voiceover
          </span>
        </button>
      </div>

      {explainer ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/60">
          Replaces the original audio with an AI voiceover whose script is
          researched from the web. Output is capped at 10 minutes.
          {!explainerReady && (
            <p className="mt-2 text-amber-300">
              ⚠️ Needs a script key (<code>ANTHROPIC_API_KEY</code>, or free{" "}
              <code>GEMINI_API_KEY</code>) and the Piper voice on the server —
              this job will fail until both are set.
            </p>
          )}
        </div>
      ) : (
        <ClipControls />
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/40">
          Download quality
        </label>
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value as VideoQuality)}
          className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-violet-400/60"
        >
          {QUALITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-neutral-900">
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-white/40">
          {explainer
            ? "Source download resolution for the explainer video."
            : "Clips render at the chosen frame; lower quality just downloads faster."}
        </p>
      </div>

      <button
        type="submit"
        disabled={busy || !url.trim()}
        className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Starting…" : explainer ? "Make explainer" : "Generate clips"}
      </button>

      <style>{`
        .num { width:100%; border-radius:0.75rem; border:1px solid rgba(255,255,255,0.1);
          background:rgba(0,0,0,0.4); padding:0.5rem 0.75rem; font-size:0.875rem; outline:none; }
        .num:focus { border-color: rgba(167,139,250,0.6); }
      `}</style>
    </form>
  );

  // Clip-only controls, grouped so explainer mode can hide them wholesale.
  function ClipControls() {
    return (
      <>
      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/40">
          Clip length
        </label>
        <div className="grid grid-cols-3 gap-2">
          {LENGTH_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.min, p.max)}
              className={`rounded-xl border px-2 py-2 text-center transition ${
                activePreset === p.id
                  ? "border-violet-400/60 bg-violet-500/20 text-white"
                  : "border-white/10 bg-black/40 text-white/70 hover:bg-white/10"
              }`}
            >
              <span className="block text-sm font-semibold">{p.label}</span>
              <span className="block text-[11px] text-white/40">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-white/40">
          Frame
        </label>
        <div className="grid grid-cols-4 gap-2">
          {ASPECT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setAspect(o.value)}
              title={o.hint}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2 transition ${
                aspect === o.value
                  ? "border-violet-400/60 bg-violet-500/20 text-white"
                  : "border-white/10 bg-black/40 text-white/70 hover:bg-white/10"
              }`}
            >
              <span
                className={`${o.box} rounded-[3px] border ${
                  aspect === o.value
                    ? "border-violet-300 bg-violet-300/30"
                    : "border-white/40"
                }`}
              />
              <span className="text-xs font-semibold">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Clips" value={clipCount}>
          <input
            type="number"
            min={1}
            max={12}
            value={clipCount}
            onChange={(e) => setClipCount(Number(e.target.value))}
            className="num"
          />
        </Field>
        <Field label="Min sec" value={minDuration}>
          <input
            type="number"
            min={5}
            max={120}
            value={minDuration}
            onChange={(e) => setMinDuration(Number(e.target.value))}
            className="num"
          />
        </Field>
        <Field label="Max sec" value={maxDuration}>
          <input
            type="number"
            min={10}
            max={180}
            value={maxDuration}
            onChange={(e) => setMaxDuration(Number(e.target.value))}
            className="num"
          />
        </Field>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={captions}
          onChange={(e) => setCaptions(e.target.checked)}
          className="h-4 w-4 accent-violet-500"
        />
        Burn word-synced captions
      </label>
      </>
    );
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  value: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/40">
        {label}
      </label>
      {children}
    </div>
  );
}
