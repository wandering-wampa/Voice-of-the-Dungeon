# Voice of the Dungeon

Local-first, voice-driven D&D 5e DM assistant.

## Status
This is a fresh Electron + Vite + React scaffold. Core systems are not implemented yet.

## Prerequisites
- Windows 10/11
- Node.js 20+ and npm
- Git
- Ollama (LLM narrator)
- STT: whisper.cpp or faster-whisper service
- TTS: Piper

## Dev Setup
1. `npm install`
2. `npm run dev`

## Build
- `npm run build`

## Notes
- The app will store data under the Electron userData directory at runtime.
- STT, TTS, and narrator integrations will be wired in later milestones.
