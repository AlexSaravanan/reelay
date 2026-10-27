# Reelay — single-image deploy (frontend + API + ffmpeg + whisper).
# Targets Hugging Face Spaces (Docker SDK), but runs anywhere with `docker run`.
FROM node:20-bookworm-slim

# System deps: ffmpeg (Debian's build includes libass, so captions burn in),
# python3 for faster-whisper, curl for the yt-dlp binary.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-venv python3-pip curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp — self-contained release binary (kept current by its own -U, if needed).
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Run as a non-root user with a writable home (Hugging Face Spaces convention:
# UID 1000). Model/download caches live under this home.
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    HF_HOME=/home/user/.cache/huggingface \
    XDG_CACHE_HOME=/home/user/.cache
USER user
WORKDIR /home/user/app

# --- Python venv for transcription (faster-whisper + PyAV) ---
COPY --chown=user:user scripts/requirements.txt scripts/requirements.txt
RUN python3 -m venv .venv \
    && ./.venv/bin/pip install --no-cache-dir --upgrade pip \
    && ./.venv/bin/pip install --no-cache-dir -r scripts/requirements.txt

# --- Node deps (all workspaces) ---
COPY --chown=user:user package.json package-lock.json ./
COPY --chown=user:user server/package.json server/package.json
COPY --chown=user:user web/package.json web/package.json
RUN npm ci

# --- App source + build (web static + server dist) ---
COPY --chown=user:user . .
RUN npm run build

# Pre-download the Whisper model at build time so the first request is fast.
# "base" is a good speed/accuracy tradeoff on the 2-vCPU free tier.
ENV WHISPER_MODEL=base
RUN ./.venv/bin/python -c \
    "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"

ENV NODE_ENV=production \
    PORT=7860 \
    PYTHON_BIN=/home/user/app/.venv/bin/python \
    WORKSPACE_DIR=/home/user/app/workspace
# Optional: set ANTHROPIC_API_KEY as a Space secret to use Claude for highlight
# selection; without it, Reelay falls back to the built-in heuristic.

EXPOSE 7860
CMD ["node", "server/dist/index.js"]
