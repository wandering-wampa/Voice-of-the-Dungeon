# Voice of the Dungeon

Local-first, voice-driven D&D 5e DM assistant.

## Status
This is a fresh Electron + Vite + React scaffold. Core systems are not implemented yet.

## Prerequisites
- Windows 10/11
- Node.js 20+ and npm
- Git
- Ollama (LLM narrator)
- TTS: Piper
- NVIDIA CUDA Toolkit 12.x (required for GPU STT; provides `cublas64_12.dll`)

## Dev Setup
1. `npm install`
2. `npm run dev`

## Build
- `npm run build`

## Notes
- The app will store data under the Electron userData directory at runtime.
- STT runs locally and is managed by the app (auto-start + auto-download runtime).

### STT Configuration (Current)
Push-to-talk audio is held in memory, converted to 16kHz WAV, and sent to a local faster-whisper service.
The app will auto-start the STT runtime. On first run it will download the runtime pack.
First-run STT setup requires an internet connection to download the runtime.

Environment variables:
- `VOD_STT_URL` (default `http://127.0.0.1:8000/v1/audio/transcriptions`)
- `VOD_STT_MODEL` (default `small`)
- `VOD_STT_LANG` (default `en`)
- `VOD_STT_RUNTIME_URL` (override runtime pack download URL)
- `VOD_STT_RUNTIME_EXE` (override runtime executable name)
- `VOD_STT_RUNTIME_VERSION` (override runtime pack version key)

Runtime pack note:
- The default runtime URL points to a GitHub Release asset that must be published as `vod-stt-win-x64.zip`.
- Logs are written under the userData directory: `stt/logs/`.
- The app will auto-restart the STT service if it crashes or the port is busy.
- The app auto-detects the CUDA install path and injects it into the STT runtime PATH.

### Build the STT runtime pack (maintainers)
See `stt-runtime/README.md` for build instructions.
