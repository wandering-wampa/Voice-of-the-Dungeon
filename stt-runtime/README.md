# Voice of the Dungeon STT Runtime

This folder contains the local faster-whisper STT service that the Electron app auto-starts.
It is packaged as a Windows executable and distributed as a zip (runtime pack) for the app
to download on first run.

## Run locally (dev)
1. Install Python 3.10+.
2. `pip install -r requirements.txt`
3. `python server.py --host 127.0.0.1 --port 8000 --model small --device cuda --compute-type int8_float16`

The server accepts:
- `POST /v1/audio/transcriptions` (OpenAI-style)
- `GET /health`
- `GET /v1/models`

## Build runtime pack (Windows)
From this folder:
1. `powershell -ExecutionPolicy Bypass -File build.ps1`

Output:
- `dist/vod-stt-win-x64.zip` (contains `vod-stt-server.exe`)

Upload the zip to the GitHub release that the app points to.

## Notes
- The server expects 16kHz mono WAV input. The app always sends 16kHz WAV.
- If CUDA is unavailable, the server falls back to CPU automatically.
