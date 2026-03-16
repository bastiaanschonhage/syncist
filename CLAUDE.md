# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Development build with file watching
npm run build      # Production build (minified, no source maps)
npm run lint       # ESLint on src/
```

No automated test framework — testing is done manually using the spec in `test/` against the TestVault.

## Architecture

**Syncist** is an Obsidian plugin for bidirectional task sync between Obsidian markdown and Todoist. TypeScript source in `src/` is compiled to a single `main.js` bundle via esbuild.

### Module Overview

| File | Responsibility |
|------|---------------|
| [src/main.ts](src/main.ts) | Plugin entry point, command registration, auto-sync interval, status bar |
| [src/sync-engine.ts](src/sync-engine.ts) | Core bidirectional sync logic (~737 lines) |
| [src/task-parser.ts](src/task-parser.ts) | Parse/build markdown task lines with emoji metadata |
| [src/todoist-service.ts](src/todoist-service.ts) | Direct Todoist REST API v1 integration (no SDK) |
| [src/types.ts](src/types.ts) | All TypeScript interfaces and types |
| [src/settings.ts](src/settings.ts) | Plugin settings UI tab |
| [src/import-modal.ts](src/import-modal.ts) | Fuzzy search modal for importing Todoist tasks |
| [src/query-renderer.ts](src/query-renderer.ts) | Renders `syncist` code blocks as interactive task lists |

### Sync Flow

`SyncEngine.performSync()` runs in stages:
1. Fetch all tasks from Todoist API
2. Scan all Obsidian vault markdown files for lines with the sync tag
3. Push new Obsidian tasks to Todoist (parents before children)
4. Bidirectionally sync existing tasks using content hashes to detect which side changed
5. Clean stale sync state entries

Conflict resolution is configurable: `obsidian-wins`, `todoist-wins`, or `ask-user`.

### Task Format

Tasks are identified by the sync tag (default `#todoist`) and carry metadata as inline markers:
- Todoist ID: `<!-- todoist-id:ABC123 -->`
- Due date: `📅 YYYY-MM-DD`
- Priority: `⏫` (high) / `🔼` (medium) / `🔽` (low)
- Labels: `#label-name` (hashtags, excluding sync tag)
- Project: `📁 ProjectName`
- Subtask hierarchy: indentation level

### Releasing

Use `/release` to run the full release workflow automatically.

Manual steps (for reference):
1. Bump version in `manifest.json` and `package.json` (`npm pkg set version=X.Y.Z`)
2. `npm run build`
3. Commit `manifest.json`, `package.json`, `main.js` (`package-lock.json` is gitignored)
4. `gh release create vX.Y.Z main.js manifest.json styles.css --title "vX.Y.Z" --notes "..."`

BRAT installs from GitHub releases, not commits — the release step is required.

### Key Constraints

- Uses Obsidian's `requestUrl()` for all HTTP calls (no fetch/axios) — required for mobile compatibility
- `data.json` is gitignored (contains API token at runtime)
- The compiled `main.js` is committed to the repo (Obsidian loads it directly)
- External modules excluded from bundle: `obsidian`, `electron`, `codemirror/*`, Node built-ins
