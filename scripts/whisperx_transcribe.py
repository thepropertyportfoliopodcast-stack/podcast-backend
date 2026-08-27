#!/usr/bin/env python3
"""Generate compact word/segment timing JSON for one podcast episode."""

import argparse
import gc
import json
import os
import sys
from pathlib import Path


def report_progress(percent, message):
    """Emit a machine-readable progress event for the Node queue worker."""
    print(
        "WHISPERX_PROGRESS:" + json.dumps({"percent": int(percent), "message": str(message)}),
        flush=True,
    )


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="small.en")
    parser.add_argument("--language", default="en")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--threads", type=int, default=1)
    parser.add_argument("--diarize", action="store_true")
    parser.add_argument("--hf-token", default="")
    parser.add_argument("--min-speakers", type=int)
    parser.add_argument("--max-speakers", type=int)
    return parser.parse_args()


def milliseconds(value, fallback=0):
    try:
        return max(0, int(round(float(value) * 1000)))
    except (TypeError, ValueError):
        return fallback


def fill_missing_timings(words, segment_start, segment_end):
    """Give rare unaligned words a bounded interpolated time instead of dropping them."""
    index = 0
    while index < len(words):
        if words[index].get("start") is not None and words[index].get("end") is not None:
            index += 1
            continue
        run_start = index
        while index < len(words) and (words[index].get("start") is None or words[index].get("end") is None):
            index += 1
        run_end = index
        left = words[run_start - 1].get("end") if run_start else segment_start
        right = words[run_end].get("start") if run_end < len(words) else segment_end
        left = float(left if left is not None else segment_start)
        right = float(right if right is not None else segment_end)
        if right <= left:
            right = left + (0.12 * max(1, run_end - run_start))
        step = (right - left) / max(1, run_end - run_start)
        for offset, word_index in enumerate(range(run_start, run_end)):
            words[word_index]["start"] = left + (step * offset)
            words[word_index]["end"] = left + (step * (offset + 1))
    return words


def serialise_result(result, audio_duration_ms, model_name):
    compact_words = []
    compact_segments = []
    previous_end = 0

    for segment_index, source_segment in enumerate(result.get("segments") or []):
        raw_words = [dict(word) for word in (source_segment.get("words") or []) if str(word.get("word") or "").strip()]
        segment_start = float(source_segment.get("start") or (previous_end / 1000))
        segment_end = float(source_segment.get("end") or segment_start)
        fill_missing_timings(raw_words, segment_start, segment_end)
        first_word = len(compact_words)

        for raw_word in raw_words:
            text = str(raw_word.get("word") or "").strip()
            start_ms = milliseconds(raw_word.get("start"), previous_end)
            end_ms = max(start_ms + 1, milliseconds(raw_word.get("end"), start_ms + 1))
            speaker = raw_word.get("speaker") or source_segment.get("speaker")
            compact = {
                "text": text,
                "startMs": start_ms,
                "endMs": end_ms,
                "segment": segment_index,
            }
            if speaker:
                compact["speaker"] = str(speaker)
            if raw_word.get("score") is not None:
                compact["score"] = round(float(raw_word["score"]), 4)
            compact_words.append(compact)
            previous_end = end_ms

        segment_text = str(source_segment.get("text") or "").strip()
        if not segment_text and len(compact_words) > first_word:
            segment_text = " ".join(word["text"] for word in compact_words[first_word:])
        compact_segment = {
            "text": segment_text,
            "startMs": milliseconds(source_segment.get("start"), compact_words[first_word]["startMs"] if len(compact_words) > first_word else previous_end),
            "endMs": milliseconds(source_segment.get("end"), previous_end),
            "firstWord": first_word,
            "lastWord": len(compact_words),
        }
        if source_segment.get("speaker"):
            compact_segment["speaker"] = str(source_segment["speaker"])
        compact_segments.append(compact_segment)

    text = "\n\n".join(segment["text"] for segment in compact_segments if segment["text"]).strip()
    return {
        "language": result.get("language") or "en",
        "text": text,
        "words": compact_words,
        "segments": compact_segments,
        "durationMs": audio_duration_ms,
        "model": model_name,
    }


def main():
    args = parse_args()
    try:
        import torch
        import whisperx

        if args.device == "cpu":
            torch.set_num_threads(max(1, args.threads))

        report_progress(8, "Loading episode audio")
        audio = whisperx.load_audio(args.audio)
        duration_ms = int(round((len(audio) / 16000) * 1000))
        language = None if args.language.lower() == "auto" else args.language.lower()
        report_progress(12, "Loading WhisperX speech model")
        model = whisperx.load_model(
            args.model,
            args.device,
            compute_type=args.compute_type,
            language=language,
        )
        report_progress(20, "Transcribing English audio")
        result = model.transcribe(audio, batch_size=max(1, args.batch_size))
        detected_language = result.get("language") or language or "en"
        report_progress(68, "Speech recognition complete")

        del model
        gc.collect()
        if args.device == "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()

        report_progress(72, "Loading word-alignment model")
        align_model, metadata = whisperx.load_align_model(language_code=detected_language, device=args.device)
        report_progress(78, "Aligning every word to the audio")
        result = whisperx.align(
            result.get("segments") or [],
            align_model,
            metadata,
            audio,
            args.device,
            return_char_alignments=False,
        )
        result["language"] = detected_language

        if args.diarize:
            report_progress(88, "Identifying speaker changes")
            if not args.hf_token:
                raise RuntimeError("WHISPERX_HF_TOKEN is required when speaker diarization is enabled")
            from whisperx.diarize import DiarizationPipeline
            diarizer = DiarizationPipeline(token=args.hf_token, device=args.device)
            diarize_kwargs = {}
            if args.min_speakers:
                diarize_kwargs["min_speakers"] = args.min_speakers
            if args.max_speakers:
                diarize_kwargs["max_speakers"] = args.max_speakers
            diarized = diarizer(audio, **diarize_kwargs)
            result = whisperx.assign_word_speakers(diarized, result)

        report_progress(94, "Preparing transcript data")
        payload = serialise_result(result, duration_ms, args.model)
        if not payload["words"]:
            raise RuntimeError("WhisperX returned no aligned words")

        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = output_path.with_suffix(output_path.suffix + ".tmp")
        temporary_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary_path, output_path)
        report_progress(99, "Saving completed transcript")
    except Exception as error:
        print(f"WhisperX transcription failed: {error}", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
