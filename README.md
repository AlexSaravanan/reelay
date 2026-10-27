# Reelay

Turn long videos into short, captioned vertical clips — a self-hosted,
open-source take on tools like Klap.

Paste a video URL. Reelay downloads it, transcribes the audio, finds the most
clip-worthy moments, and renders each one as a 9:16 MP4 with burned-in,
word-synced captions — ready for TikTok, Reels and Shorts.

## How it works

```
URL ──► yt-dlp ──► ffmpeg (audio) ──► Whisper ──► highlight picker ──► ffmpeg
      download      extract 16kHz     transcript   Claude or heuristic   cut · crop 9:16 · caption
```

- **Ingest** — `yt-dlp` downloads the source video.
- **Transcribe** — `faster-whisper` produces a transcript with word-level timestamps.
- **Select** — Claude reads the transcript and picks the best moments. With no
  API key, a built-in heuristic (length fit + word density + hook keywords)
  stands in, so the app works fully offline.
- **Render** — `ffmpeg` cuts each moment, center-crops to vertical, scales to
  1080×1920, and burns styled captions from the word timings.

## Requirements

- **Node.js** ≥ 20
- **ffmpeg** / **ffprobe** — `brew install ffmpeg`
- **yt-dlp** — `brew install yt-dlp`
- **Python 3** with `faster-whisper` (installed into a local venv — see below)
- **Optional:** an `ANTHROPIC_API_KEY` for AI highlight selection

## Setup

```bash
# 1. JS dependencies (installs both server and web workspaces)
npm install

# 2. Python transcription dependency
bash scripts/setup-python.sh

# 3. Config (all values optional)
cp .env.example .env

# 4. Verify tools
npm run doctor
```

## Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:5174 (the frontend proxies `/api` to it)

Paste a URL, tune the clip count and duration range, and watch the pipeline run
live. Clips can be previewed and downloaded from the browser.

## Configuration

See [.env.example](.env.example). Highlights:

| Variable            | Default            | Purpose                                   |
| ------------------- | ------------------ | ----------------------------------------- |
| `WHISPER_MODEL`     | `small`            | `tiny`→`large-v3`; bigger = better/slower |
| `ANTHROPIC_API_KEY` | _(unset)_          | Enables Claude highlight selection        |
| `ANTHROPIC_MODEL`   | `claude-opus-5-5`  | Model used when a key is set              |
| `WORKSPACE_DIR`     | `./workspace`      | Where videos, transcripts and clips live  |

## Project layout

```
server/   Express + TypeScript API and the processing pipeline
  src/pipeline/   ingest · transcribe · highlights · captions · render
web/      Vite + React + Tailwind UI
scripts/  transcribe.py (Whisper helper) · doctor · setup-python
```

## Notes & limitations

- Use Reelay only on videos you have the rights to repurpose.
- Processing time is dominated by transcription; a smaller `WHISPER_MODEL` or a
  GPU-backed Whisper build speeds it up.
- Jobs are kept in memory; restarting the server clears the job list (rendered
  files remain under `workspace/`).
