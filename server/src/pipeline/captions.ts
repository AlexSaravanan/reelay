import fs from "node:fs/promises";
import type { Transcript, Word } from "../types.js";

// Few words per cue keeps the punchy short-form rhythm and, at this font size,
// keeps each cue inside the frame (with WrapStyle 0 as a safety net for the
// occasional long word run).
const MAX_WORDS_PER_CUE = 3;

/**
 * Build an ASS subtitle file for a clip spanning [start, end] of the video.
 * Times are rebased to the clip (0 = clip start), since we cut before burning.
 * Returns true if any captions were written.
 */
export async function writeClipCaptions(
  transcript: Transcript,
  start: number,
  end: number,
  outPath: string,
  canvasW = 1080,
  canvasH = 1920,
): Promise<boolean> {
  const words = collectWords(transcript, start, end).map((w) => ({
    start: Math.max(0, w.start - start),
    end: Math.max(0, w.end - start),
    word: w.word.trim(),
  }));

  if (words.length === 0) {
    return false;
  }

  const cues = groupWords(words);
  const events = cues
    .map(
      (c) =>
        `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,${escapeAss(
          c.text,
        )}`,
    )
    .join("\n");

  await fs.writeFile(outPath, assHeader(canvasW, canvasH) + events + "\n", "utf-8");
  return true;
}

function collectWords(
  transcript: Transcript,
  start: number,
  end: number,
): Word[] {
  const words: Word[] = [];
  for (const seg of transcript.segments) {
    if (seg.end < start || seg.start > end) continue;
    for (const w of seg.words) {
      if (w.end >= start && w.start <= end) words.push(w);
    }
  }
  return words;
}

interface Cue {
  start: number;
  end: number;
  text: string;
}

function groupWords(words: { start: number; end: number; word: string }[]): Cue[] {
  const cues: Cue[] = [];
  for (let i = 0; i < words.length; i += MAX_WORDS_PER_CUE) {
    const chunk = words.slice(i, i + MAX_WORDS_PER_CUE);
    cues.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((w) => w.word).join(" ").toUpperCase(),
    });
  }
  // Prevent overlaps / zero-length cues.
  for (let i = 0; i < cues.length; i++) {
    if (cues[i].end <= cues[i].start) cues[i].end = cues[i].start + 0.4;
    if (i + 1 < cues.length && cues[i].end > cues[i + 1].start) {
      cues[i].end = cues[i + 1].start;
    }
  }
  return cues;
}

function assTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.round((sec - Math.floor(sec)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(
    cs,
  ).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\n/g, " ").replace(/\{/g, "(").replace(/\}/g, ")");
}

// Big, bold, centered-low captions with a thick outline — the standard
// short-form look, sized relative to the frame so it holds at any aspect ratio.
// The proportions below reproduce the original 1080x1920 look exactly.
// Colors are &HAABBGGRR (alpha, blue, green, red).
function assHeader(w: number, h: number): string {
  const fontSize = Math.round(h * 0.05); // 1920 -> 96
  const outline = Math.max(2, Math.round(fontSize / 16)); // 96 -> 6
  const marginV = Math.round(h * 0.22); // 1920 -> ~422
  const marginH = Math.round(w * 0.074); // 1080 -> ~80
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${outline},2,2,${marginH},${marginH},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}
