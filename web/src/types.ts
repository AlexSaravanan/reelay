export type JobStage =
  | "queued"
  | "ingesting"
  | "transcribing"
  | "selecting"
  | "rendering"
  | "done"
  | "error"
  | "cancelled";

export type VideoQuality = "max" | "1080" | "720" | "480";

export type AspectRatio = "9:16" | "4:3" | "1:1" | "16:9";

export type JobMode = "clips" | "explainer";

export interface Clip {
  id: string;
  file: string;
  thumbnail?: string;
  title: string;
  reason: string;
  score: number;
  start: number;
  end: number;
  durationSec: number;
}

export interface Job {
  id: string;
  createdAt: number;
  source: { kind: "url" | "upload"; value: string; title?: string };
  options: {
    mode: JobMode;
    clipCount: number;
    minDuration: number;
    maxDuration: number;
    captions: boolean;
    quality: VideoQuality;
    aspect: AspectRatio;
  };
  stage: JobStage;
  progress: number;
  message: string;
  selector?: "claude" | "heuristic";
  clips: Clip[];
  error?: string;
  hasTranscript?: boolean;
}

export interface Health {
  ok: boolean;
  whisperModel: string;
  selector: "claude" | "heuristic";
  model: string | null;
  explainer: boolean;
}
