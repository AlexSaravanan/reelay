export type JobStage =
  | "queued"
  | "ingesting"
  | "transcribing"
  | "selecting"
  | "rendering"
  | "done"
  | "error"
  | "cancelled";

export interface Word {
  start: number;
  end: number;
  word: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: Word[];
}

export interface Transcript {
  language: string;
  duration: number;
  segments: TranscriptSegment[];
}

export interface Highlight {
  start: number;
  end: number;
  title: string;
  reason: string;
  /** 0-100, how promising the model/heuristic thinks this clip is. */
  score: number;
}

export interface Clip extends Highlight {
  id: string;
  /** Path segment relative to the job folder, e.g. "clips/clip-1.mp4". */
  file: string;
  thumbnail?: string;
  durationSec: number;
}

/** Source download quality cap (applied before transcription/rendering). */
export type VideoQuality = "max" | "1080" | "720" | "480";

/** Output frame aspect ratio. */
export type AspectRatio = "9:16" | "4:3" | "1:1" | "16:9";

/**
 * What to make from the source:
 *  - "clips": the default — short captioned highlight clips.
 *  - "explainer": strip the original audio and replace it with an AI voiceover
 *    whose script is researched from the web (needs ANTHROPIC_API_KEY + Piper).
 */
export type JobMode = "clips" | "explainer";

export interface JobOptions {
  /** What to produce from the source. */
  mode: JobMode;
  /** Target number of clips to produce. */
  clipCount: number;
  /** Min/max clip length in seconds. */
  minDuration: number;
  maxDuration: number;
  /** Caption styling. */
  captions: boolean;
  /** How high a source resolution to download. */
  quality: VideoQuality;
  /** Output frame aspect ratio. */
  aspect: AspectRatio;
  /** "selector" chosen at runtime: "claude" or "heuristic". */
}

export interface Job {
  id: string;
  createdAt: number;
  source: { kind: "url" | "upload"; value: string; title?: string };
  options: JobOptions;
  stage: JobStage;
  /** 0-100 overall progress. */
  progress: number;
  message: string;
  selector?: "claude" | "heuristic";
  transcript?: Transcript;
  clips: Clip[];
  error?: string;
}

export interface JobEvent {
  jobId: string;
  stage: JobStage;
  progress: number;
  message: string;
  clips?: Clip[];
  error?: string;
}
