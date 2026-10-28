#!/usr/bin/env bash
# Create the Python venv and install the transcription dependency.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r scripts/requirements.txt
echo "faster-whisper + piper-tts installed into $ROOT/.venv"

# Download the Piper voice model used by explainer mode (AI voiceover).
VOICE="${PIPER_VOICE_NAME:-en_US-lessac-medium}"
if [ ! -f "voices/${VOICE}.onnx" ]; then
  echo "Downloading Piper voice ${VOICE}…"
  .venv/bin/python -m piper.download_voices --download-dir voices "${VOICE}"
fi
echo "Piper voice ready at $ROOT/voices/${VOICE}.onnx"
