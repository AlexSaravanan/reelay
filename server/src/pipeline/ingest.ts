import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import type { VideoQuality } from "../types.js";
import { CancelledError, run } from "./proc.js";

/**
 * yt-dlp auth flags for sites (YouTube especially) that demand a logged-in
 * session. Resolved per call so a cookies file written at startup is picked up.
 *   - YTDLP_COOKIES_FROM_BROWSER=chrome|safari|firefox… (local machines only)
 *   - YTDLP_COOKIES=/path/to/cookies.txt (Netscape format; works on servers)
 */
function authArgs(): string[] {
  const fromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (fromBrowser) return ["--cookies-from-browser", fromBrowser];
  const cookieFile = process.env.YTDLP_COOKIES?.trim();
  if (cookieFile && existsSync(cookieFile)) return ["--cookies", cookieFile];
  return [];
}

const BOT_CHECK = /sign in to confirm|not a bot|use --cookies/i;

export interface IngestResult {
  videoPath: string;
  title: string;
}

// Quality tier -> cap applied to BOTH dimensions, using the tier's long-side
// value. Capping both sides at the long-side size works for either orientation:
// a 1080p source is 1920x1080 or 1080x1920, so a 1920 cap admits both, while a
// 1280 (720p) cap rejects either 1920-tall or 1920-wide source. null = no cap.
const QUALITY_CAP: Record<VideoQuality, number | null> = {
  max: null,
  "1080": 1920,
  "720": 1280,
  "480": 854,
};

function formatFor(quality: VideoQuality): string {
  const cap = QUALITY_CAP[quality];
  if (cap === null) return "bv*+ba/b";
  const within = `[height<=${cap}][width<=${cap}]`;
  return `bv*${within}+ba/b${within}/b`;
}

/**
 * Download a video from a URL with yt-dlp, or use an already-uploaded file.
 * Returns the local path to an mp4 and a human title.
 */
export async function ingest(
  source: { kind: "url" | "upload"; value: string },
  dir: string,
  quality: VideoQuality,
  onProgress: (pct: number, msg: string) => void,
  signal?: AbortSignal,
): Promise<IngestResult> {
  if (source.kind === "upload") {
    const title = path.basename(source.value).replace(/\.[^.]+$/, "");
    return { videoPath: source.value, title };
  }

  const outTemplate = path.join(dir, "source.%(ext)s");
  let title = "video";

  const auth = authArgs();

  // Grab the title first (cheap metadata call).
  try {
    const meta = await run(config.ytdlpBin, [
      "--no-warnings",
      ...auth,
      "--print",
      "%(title)s",
      "--skip-download",
      source.value,
    ]);
    title = meta.stdout.trim().split("\n")[0] || "video";
  } catch {
    // Non-fatal; keep default title.
  }

  onProgress(3, "Starting download…");

  // yt-dlp emits [download] progress on stdout (with \r), so parse both
  // streams and force newline-delimited progress lines for reliable parsing.
  let lastPct = -1;
  const onChunk = (chunk: string) => {
    // Split on both newlines and carriage returns (progress uses \r).
    for (const line of chunk.split(/[\r\n]+/)) {
      const m = line.match(/\[download\]\s+([\d.]+)%/);
      if (m) {
        const pct = Math.min(99, parseFloat(m[1]));
        if (pct !== lastPct) {
          lastPct = pct;
          onProgress(5 + pct * 0.9, `Downloading video… ${pct.toFixed(1)}%`);
        }
      } else if (/\[(Merger|ExtractAudio|VideoConvertor)\]/.test(line)) {
        onProgress(99, "Finalizing download…");
      }
    }
  };

  try {
    await run(
      config.ytdlpBin,
      [
        "--no-warnings",
        "--no-playlist",
        "--newline", // one progress update per line instead of \r overwrites
        "--progress",
        ...auth,
        // Cap resolution per the chosen quality tier (applied to both dimensions
        // so it holds for landscape and vertical sources alike).
        "-f",
        formatFor(quality),
        "--merge-output-format",
        "mp4",
        "-o",
        outTemplate,
        source.value,
      ],
      { signal, onStdout: onChunk, onStderr: onChunk },
    );
  } catch (err) {
    if (err instanceof CancelledError) throw err;
    if (BOT_CHECK.test((err as Error).message) && auth.length === 0) {
      throw new Error(
        "YouTube blocked this download with a bot check. Supply cookies from a " +
          "logged-in session: set YTDLP_COOKIES to a Netscape cookies.txt file " +
          "(best for servers), or YTDLP_COOKIES_FROM_BROWSER=chrome when running " +
          "locally. See the README section “Downloads blocked by YouTube”.",
      );
    }
    throw err;
  }

  // yt-dlp wrote source.<ext>; find it.
  const files = await fs.readdir(dir);
  const downloaded = files.find((f) => f.startsWith("source."));
  if (!downloaded) {
    throw new Error("Download finished but no output file was found.");
  }
  return { videoPath: path.join(dir, downloaded), title };
}
