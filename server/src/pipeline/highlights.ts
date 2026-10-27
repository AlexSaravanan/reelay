import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { Highlight, JobOptions, Transcript } from "../types.js";

/**
 * Pick the most clip-worthy moments from a transcript.
 * Uses Claude when ANTHROPIC_API_KEY is set, otherwise a local heuristic.
 */
export async function selectHighlights(
  transcript: Transcript,
  options: JobOptions,
): Promise<{ highlights: Highlight[]; selector: "claude" | "heuristic" }> {
  if (config.anthropicApiKey) {
    try {
      const highlights = await selectWithClaude(transcript, options);
      if (highlights.length > 0) {
        return { highlights, selector: "claude" };
      }
    } catch (err) {
      // Fall through to the heuristic so a job never dies on an API hiccup.
      console.warn(
        "Claude highlight selection failed, using heuristic:",
        (err as Error).message,
      );
    }
  }
  return {
    highlights: selectWithHeuristic(transcript, options),
    selector: "heuristic",
  };
}

/** Build a compact [mm:ss] transcript for the model to reason over. */
function formatTranscript(transcript: Transcript): string {
  return transcript.segments
    .map((s) => `[${fmt(s.start)}-${fmt(s.end)}] ${s.text}`)
    .join("\n");
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function selectWithClaude(
  transcript: Transcript,
  options: JobOptions,
): Promise<Highlight[]> {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const system = [
    "You are a short-form video editor. Given a timestamped transcript of a",
    "long video, pick the moments that would make the best standalone vertical",
    "clips for TikTok, Reels and YouTube Shorts.",
    "Favor self-contained moments with a hook, a strong insight, a story, or an",
    "emotional or surprising beat. Each clip must make sense on its own.",
    `Each clip must be between ${options.minDuration} and ${options.maxDuration} seconds long.`,
    "Snap start/end to sentence boundaries so clips don't cut mid-word.",
  ].join(" ");

  const prompt = [
    `Select up to ${options.clipCount} clips from this transcript.`,
    "",
    "Respond with ONLY a JSON array (no prose, no markdown fences). Each item:",
    '{ "start": <seconds:number>, "end": <seconds:number>, "title": <string, <=60 chars>, "reason": <string, why it works>, "score": <0-100 integer> }',
    "",
    "Transcript:",
    formatTranscript(transcript),
  ].join("\n");

  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = extractJsonArray(text);
  return normalize(parsed, transcript, options);
}

/** Pull the first JSON array out of a model response, tolerating stray prose. */
function extractJsonArray(text: string): unknown[] {
  const trimmed = text.trim();
  try {
    const direct = JSON.parse(trimmed);
    if (Array.isArray(direct)) return direct;
  } catch {
    // fall through to bracket extraction
  }
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("Model did not return a JSON array.");
}

function normalize(
  items: unknown[],
  transcript: Transcript,
  options: JobOptions,
): Highlight[] {
  const out: Highlight[] = [];
  for (const raw of items) {
    const h = raw as Record<string, unknown>;
    let start = Number(h.start);
    let end = Number(h.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      continue;
    }
    start = Math.max(0, start);
    end = Math.min(transcript.duration, end);
    // Clamp to the allowed duration window.
    const dur = end - start;
    if (dur < options.minDuration * 0.6) continue;
    if (dur > options.maxDuration) end = start + options.maxDuration;
    out.push({
      start,
      end,
      title: String(h.title ?? "Clip").slice(0, 80),
      reason: String(h.reason ?? ""),
      score: clampScore(h.score),
    });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, options.clipCount);
}

function clampScore(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Heuristic fallback: build candidate windows from sentence-like segments and
 * score them on length fit, word density, and "hooky" keywords. No network.
 */
function selectWithHeuristic(
  transcript: Transcript,
  options: JobOptions,
): Highlight[] {
  const target = (options.minDuration + options.maxDuration) / 2;
  const segs = transcript.segments;
  const candidates: Highlight[] = [];

  for (let i = 0; i < segs.length; i++) {
    let end = segs[i].end;
    let j = i;
    const start = segs[i].start;
    // Grow the window until it reaches a good length.
    while (j < segs.length && segs[j].end - start < target) {
      end = segs[j].end;
      j++;
    }
    const dur = end - start;
    if (dur < options.minDuration || dur > options.maxDuration) continue;

    const text = segs.slice(i, j + 1).map((s) => s.text).join(" ");
    candidates.push({
      start,
      end,
      title: makeTitle(text),
      reason: "Selected by density + hook heuristic (no API key set).",
      score: scoreWindow(text, dur, target),
    });
  }

  // Greedily take top-scoring, non-overlapping windows.
  candidates.sort((a, b) => b.score - a.score);
  const chosen: Highlight[] = [];
  for (const c of candidates) {
    if (chosen.length >= options.clipCount) break;
    if (chosen.some((x) => overlaps(x, c))) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

const HOOK_WORDS = [
  "secret", "never", "always", "mistake", "why", "how", "best", "worst",
  "biggest", "truth", "actually", "surprising", "important", "money",
  "free", "stop", "avoid", "nobody", "everyone", "proven", "simple",
  "crazy", "insane", "love", "hate", "fear", "amazing", "first", "last",
];

function scoreWindow(text: string, dur: number, target: number): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  const hookHits = HOOK_WORDS.reduce(
    (n, w) => n + (lower.includes(w) ? 1 : 0),
    0,
  );
  const density = Math.min(1, words.length / (dur * 3)); // ~3 words/sec is lively
  const lengthFit = 1 - Math.abs(dur - target) / target;
  const question = /\?/.test(text) ? 0.1 : 0;
  const score =
    40 * density + 25 * lengthFit + Math.min(25, hookHits * 6) + question * 100;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function makeTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const firstSentence = clean.split(/(?<=[.!?])\s/)[0] ?? clean;
  return firstSentence.slice(0, 60);
}

function overlaps(a: Highlight, b: Highlight): boolean {
  return a.start < b.end && b.start < a.end;
}
