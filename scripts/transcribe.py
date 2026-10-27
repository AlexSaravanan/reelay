#!/usr/bin/env python3
"""Transcribe an audio/video file with faster-whisper and emit JSON.

Usage:
    transcribe.py <input_media> <output_json> [--model small] [--language auto]

Output JSON shape:
    {
      "language": "en",
      "duration": 123.4,
      "segments": [
        {"start": 0.0, "end": 3.2, "text": "Hello there",
         "words": [{"start": 0.0, "end": 0.4, "word": "Hello"}, ...]}
      ]
    }
"""
import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--model", default="small")
    parser.add_argument("--language", default="auto")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper is not installed. Run scripts/setup-python.sh.",
            file=sys.stderr,
        )
        return 2

    # CPU with int8 is the portable default; it runs fine on Apple Silicon.
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    language = None if args.language == "auto" else args.language
    segments_iter, info = model.transcribe(
        args.input,
        language=language,
        word_timestamps=True,
        vad_filter=True,
    )

    segments = []
    for seg in segments_iter:
        words = []
        for w in seg.words or []:
            words.append(
                {
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "word": w.word,
                }
            )
        segments.append(
            {
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "words": words,
            }
        )
        # Progress to stderr so the parent process can show it live.
        print(f"PROGRESS {seg.end:.1f}/{info.duration:.1f}", file=sys.stderr, flush=True)

    result = {
        "language": info.language,
        "duration": round(info.duration, 3),
        "segments": segments,
    }
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    print(f"DONE {len(segments)} segments", file=sys.stderr, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
