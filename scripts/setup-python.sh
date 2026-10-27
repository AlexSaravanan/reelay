#!/usr/bin/env bash
# Create the Python venv and install the transcription dependency.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r scripts/requirements.txt
echo "faster-whisper installed into $ROOT/.venv"
