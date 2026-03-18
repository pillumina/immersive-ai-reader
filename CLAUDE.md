# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Immersive AI Reader is a Tauri 2 desktop PDF reader with canvas-based interaction and AI-powered conversation. It uses a React/Vite frontend and Rust backend.

## Commands

```bash
# Development
npm run tauri dev        # Run full Tauri app (compiles Rust first, ~5-10min on fresh install)
npm run dev              # Frontend only (Vite on port 5173)
npm run build            # Build frontend for production

# Testing
npm test                 # Run vitest tests with UI
npm run test:run         # Run tests headless
npm run lint             # ESLint check

# Tauri
npm run tauri build      # Build production app bundle
```

## Architecture

### Frontend (src/)

- **React 18** with TypeScript, no build-time React plugin (uses esbuild JSX automatic mode)
- **Vite 6** dev server on port 5173 with `@` alias to `src/`
- **pdfjs-dist 4.0** for PDF parsing (runs in a web worker)
- **Fabric.js 6.0** for canvas rendering/manipulation
- **Path aliases**: `@/` maps to `src/`

Key modules:
- `src/lib/pdf/` — PDF parsing, validation, rendering pipeline
- `src/lib/canvas/` — Fabric.js canvas manager
- `src/lib/tauri/` — Tauri IPC wrapper (`invoke()` calls)
- `src/lib/storage/` — IndexedDB operations for documents/annotations/conversations
- `src/hooks/` — usePDF, useAI, useCanvasRendering, useSettings

### Backend (src-tauri/)

- **Tauri 2** with Rust, **SQLite** via sqlx, **reqwest** for AI API calls, **keyring** for system keychain
- **Commands** exposed to frontend via `src-tauri/src/commands/`
- **Models** in `src-tauri/src/models/` — Document, Annotation, Conversation
- **Database** in `src-tauri/src/database/` — sqlx repository pattern
- **AI clients** in `src-tauri/src/ai/` — Zhipu GLM-4 and Minimax support

## Data Flow

1. PDF uploaded via Tauri dialog plugin → pdfjs worker parses → page rendered to canvas via Fabric.js
2. AI chat: frontend sends message + extracted text context → Tauri command → Rust AI client → API → response streamed back
3. Annotations stored in IndexedDB (frontend) + SQLite (backend for sync)
4. API keys stored in system keychain via Rust keyring crate

## Build Notes

- First `tauri dev` compiles all Rust dependencies (5-10 min). Subsequent runs ~30s.
- Vite dev server must clear module cache during Tauri dev (`Cache-Control: no-store` header)
- pdfjs-dist is chunked separately in production builds (`manualChunks`)
- Database path (macOS): `~/Library/Application Support/com.immersive-ai-reader/reader.db`

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/lib.rs` | Tauri app setup, command registration |
| `src-tauri/src/commands/` | Tauri command handlers |
| `src-tauri/src/ai/client.rs` | AI API client (Zhipu/Minimax) |
| `src-tauri/src/security/keychain.rs` | System keychain for API keys |
| `src/lib/tauri/commands.ts` | Frontend Tauri IPC wrapper |
| `src/hooks/usePDF.ts` | PDF loading/rendering hook |
| `vite.config.ts` | Vite config with JSX automatic mode, path aliases |
| `docs/ROADMAP_PROGRESS.md` | Feature roadmap and progress tracking |

## Workflow Notes

- **Every time a feature is completed or a new feature is planned, update `docs/ROADMAP_PROGRESS.md`** to reflect the latest progress.
