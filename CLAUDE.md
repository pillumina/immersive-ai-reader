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
- `src/lib/tauri/` — Tauri IPC wrapper (`invoke()` calls)
- `src/hooks/` — usePDF, useAI, useCanvasRendering, useSettings
- `src/utils/` — Utility functions (markdown parser, etc.)

### Backend (src-tauri/)

- **Tauri 2** with Rust, **SQLite** via sqlx, **reqwest** for AI API calls, **keyring** for system keychain
- **Commands** exposed to frontend via `src-tauri/src/commands/`
- **Models** in `src-tauri/src/models/` — Document, Annotation, Conversation
- **Database** in `src-tauri/src/database/` — sqlx repository pattern
- **AI clients** in `src-tauri/src/ai/` — Zhipu GLM-4, Zhipu Coding, and Minimax support

## Data Flow

1. PDF uploaded via Tauri dialog plugin → pdfjs worker parses → page rendered to DOM
2. AI chat: frontend sends message + extracted text context → Tauri command → Rust AI client → API → response streamed back via SSE
3. Annotations stored in SQLite (backend only, no IndexedDB)
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
| `src/hooks/useAI.ts` | AI chat hook with routing and streaming |
| `src/hooks/useCanvasRendering.ts` | Canvas rendering with annotations |
| `src/hooks/useSettings.ts` | Settings management with Zod validation |
| `src/hooks/useFocusMode.tsx` | Focus Mode state management (FocusModeProvider + useFocusMode) |
| `src/components/ui/ErrorBoundary.tsx` | React error boundary |
| `src/utils/markdown.ts` | Markdown to HTML converter |
| `vite.config.ts` | Vite config with JSX automatic mode, path aliases |
| `docs/ROADMAP_PROGRESS.md` | Feature roadmap and progress tracking |

## Workflow Notes

### Documentation Updates

- **Every time a feature is completed or a new feature is planned, update `docs/ROADMAP_PROGRESS.md`** to reflect the latest progress.

### Git Workflow

- **Commit frequently**: After completing any meaningful change (bugfix, feature, refactor), create a commit immediately.
- **Small, focused commits**: Each commit should represent a single logical change.
- **Commit message format**:
  ```
  type: short description

  Detailed explanation (if needed)
  ```

  Types: `feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `chore:`

- **Before committing**:
  1. Run `npm run lint` to check for errors
  2. Verify the change works correctly
  3. Update `docs/ROADMAP_PROGRESS.md` if it's a feature

### Code Review Guidelines

After implementing any bugfix or feature:

1. **Self-review the code**: Check for potential issues, edge cases, and best practices
2. **Verify lint passes**: `npm run lint` should show no errors
3. **Test the change**: Ensure the feature works as expected or the bug is fixed
4. **Check for regressions**: Ensure existing functionality still works
5. **Review for security**: Check for potential security issues (XSS, injection, etc.)
6. **Update documentation**: Add completion log to `docs/ROADMAP_PROGRESS.md`

### Development Priorities

Current optimization roadmap (in order):

1. ✅ Error Boundary - React error boundaries for crash recovery
2. ✅ Dead code cleanup - Removed lib/storage/, lib/canvas/, lib/annotation/
3. ✅ Memory leak fixes - Proper event listener cleanup
4. ✅ Settings validation - Zod schema validation
5. ✅ Markdown parser extraction - Standalone utility
6. ⏳ Debounced auto-save - Prevent data loss on crashes
7. ⏳ Network retry logic - API failure auto-retry with backoff
8. ⏳ Dark mode - System-following + manual toggle
9. ⏳ Hook refactoring - Split large hooks into smaller modules
10. ⏳ Virtual scrolling - Viewport-based rendering for large docs
