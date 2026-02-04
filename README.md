# Voice of the Dungeon

Local-first, voice-driven D&D 5e DM assistant.

## Status
MVP foundation is in progress. Voice input + local STT are working; core game systems are not implemented yet.

## Progress (as of 2026-02-04)
- Done: Electron + Vite + React scaffold.
- Done: Push-to-talk audio capture (in-memory WAV @ 16kHz) + local STT transcription.
- Done: Managed STT runtime (auto-download, auto-start, auto-restart, port auto-select).
- Done: Dev launcher auto-clears Vite port 5173 and reports port status.
- Next: Session persistence + party/character storage.
- Next: Adventure PDF import + chunking + retrieval (FTS5).
- Next: Player command parsing + deterministic rules engine.
- Next: Narrator integration (Ollama) constrained to rules + module excerpts.

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

Notes:
- The dev launcher prints port status (e.g. `[dev] Port 5173 status: free`) after Vite starts.
- If port 5173 is busy, the launcher will attempt to free it automatically.
- Override the Vite port with `VITE_PORT=####` if needed.

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
- The app will auto-restart the STT service if it crashes or the port is busy (port auto-selects if 8000 is taken).
- The app auto-detects the CUDA install path and injects it into the STT runtime PATH.
- The app shuts down the STT service on exit to release ports.

### Build the STT runtime pack (maintainers)
See `stt-runtime/README.md` for build instructions.
