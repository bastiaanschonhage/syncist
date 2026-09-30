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
| [src/sync-engine.ts](src/sync-engine.ts) | Core bidirectional sync logic |
| [src/task-parser.ts](src/task-parser.ts) | Parse/build markdown task lines with emoji metadata |
| [src/todoist-service.ts](src/todoist-service.ts) | Direct Todoist REST API v1 integration (no SDK) |
| [src/types.ts](src/types.ts) | All TypeScript interfaces and types |
| [src/settings.ts](src/settings.ts) | Plugin settings UI tab |
| [src/import-modal.ts](src/import-modal.ts) | Fuzzy search modal for importing Todoist tasks |
| [src/query-renderer.ts](src/query-renderer.ts) | Renders `syncist` code blocks as interactive task lists |
| [src/shorthand-highlighter.ts](src/shorthand-highlighter.ts) | Editor extension highlighting shorthand (p1, today, dd/mm) that sync will convert |

### Sync Flow

`SyncEngine.performSync()` runs in stages:
1. Fetch all tasks from Todoist API
2. Scan all Obsidian vault markdown files for lines with the sync tag, and rewrite shorthand metadata to the emoji format
3. Push new Obsidian tasks to Todoist (parents before children)
4. Bidirectionally sync existing tasks using content hashes to detect which side changed
5. Clean stale sync state entries

Conflict resolution is configurable: `obsidian-wins`, `todoist-wins`, or `ask-user`.

### Task Format

Tasks are identified by the sync tag (default `#todoist`) and carry metadata as inline markers:
- Todoist ID: `<!-- todoist-id:ABC123 -->`
- Due date: `📅 YYYY-MM-DD`
- Priority: `🔺` (p1) / `⏫` (p2) / `🔼` (p3) / `🔽` or none (p4)
- Labels: `#label-name` (hashtags, excluding sync tag)
- Project: `📁 ProjectName`
- Subtask hierarchy: indentation level

Shorthand (setting `parseShorthand`, default on): `p1`–`p4` for priority and `today` / `tomorrow` / `dd/mm` / `dd/mm/yy` / `dd/mm/yyyy` for the due date, as separate words. The last priority / date on the line wins (shorthand or emoji), so words left in the title after normalization are not re-parsed. `normalizeShorthand()` rewrites the active shorthand to the emoji format at the start of each sync (after the vault scan), so relative dates are pinned. `src/shorthand-highlighter.ts` is a CodeMirror extension that highlights the active shorthand in the editor.

### Releasing

Use `/release` to run the full release workflow automatically.

Manual steps (for reference):
1. Commit any finished work first (the release must be built from committed source)
2. Bump version in `manifest.json` and `package.json` (`npm pkg set version=X.Y.Z`)
3. Add an `X.Y.Z` entry at the top of "What's New" in `README.md` (minor/major releases)
4. `npm run build`
5. Commit `manifest.json`, `package.json`, `main.js`, `README.md` and push (`package-lock.json` is gitignored)
6. `gh release create X.Y.Z main.js manifest.json styles.css --title "X.Y.Z" --notes "..."` (no `v` prefix)

The plugin is in the official Obsidian community plugins. Obsidian reads the version from `manifest.json` on `main` and downloads the assets from the GitHub release with that exact tag, so both the push and the release are required.

### Key Constraints

- Uses Obsidian's `requestUrl()` for all HTTP calls (no fetch/axios) — required for mobile compatibility
- `data.json` is gitignored (contains API token at runtime)
- The compiled `main.js` is committed to the repo (Obsidian loads it directly)
- External modules excluded from bundle: `obsidian`, `electron`, `codemirror/*`, Node built-ins
