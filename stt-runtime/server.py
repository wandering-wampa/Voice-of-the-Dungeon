import argparse
import io
import threading
import wave
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel
import uvicorn

app = FastAPI()

MODEL_LOCK = threading.Lock()
MODEL_CACHE: dict[str, WhisperModel] = {}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="int8_float16")
    parser.add_argument("--cache-dir", default=None)
    return parser.parse_args()


def get_model(model_name: str, device: str, compute_type: str, cache_dir: Optional[str]):
    key = f"{model_name}:{device}:{compute_type}:{cache_dir or ''}"
    with MODEL_LOCK:
        if key in MODEL_CACHE:
            return MODEL_CACHE[key]

        try:
            model = WhisperModel(
                model_name,
                device=device,
                compute_type=compute_type,
                download_root=cache_dir
            )
        except Exception:
            if device != "cpu":
                model = WhisperModel(
                    model_name,
                    device="cpu",
                    compute_type="int8",
                    download_root=cache_dir
                )
            else:
                raise

        MODEL_CACHE[key] = model
        return model


def decode_wav(data: bytes) -> np.ndarray:
    with wave.open(io.BytesIO(data), "rb") as wf:
        channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate = wf.getframerate()
        frames = wf.readframes(wf.getnframes())

    if sample_width != 2:
        raise ValueError("Expected 16-bit PCM WAV input.")

    audio = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

    if channels > 1:
        audio = audio.reshape(-1, channels).mean(axis=1)

    if sample_rate != 16000:
        audio = resample(audio, sample_rate, 16000)

    return audio


def resample(audio: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate:
        return audio

    ratio = src_rate / dst_rate
    new_length = int(round(len(audio) / ratio))
    positions = np.arange(new_length) * ratio
    indices = np.floor(positions).astype(int)
    next_indices = np.minimum(indices + 1, len(audio) - 1)
    frac = positions - indices
    return audio[indices] + (audio[next_indices] - audio[indices]) * frac


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/v1/models")
def list_models():
    return {"data": [{"id": model_id} for model_id in MODEL_CACHE.keys()]}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("small"),
    language: Optional[str] = Form(None),
):
    data = await file.read()
    audio = decode_wav(data)

    whisper = get_model(
        model_name=model,
        device=SERVER_CONFIG["device"],
        compute_type=SERVER_CONFIG["compute_type"],
        cache_dir=SERVER_CONFIG["cache_dir"]
    )

    segments, _info = whisper.transcribe(
        audio,
        language=language,
        vad_filter=True
    )

    text = "".join(segment.text for segment in segments).strip()
    return {"text": text}


SERVER_CONFIG: dict[str, Optional[str]] = {}


def main():
    args = parse_args()
    SERVER_CONFIG["device"] = args.device
    SERVER_CONFIG["compute_type"] = args.compute_type
    SERVER_CONFIG["cache_dir"] = args.cache_dir

    if args.model:
        get_model(args.model, args.device, args.compute_type, args.cache_dir)

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
