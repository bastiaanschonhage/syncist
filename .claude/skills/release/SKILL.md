---
name: release
description: Release a new version of this Obsidian plugin (listed in the official Obsidian community plugins) to GitHub, so users get the update through Obsidian's normal plugin update. Use this skill whenever the user wants to publish, release, bump, or ship a new version of the plugin — whether they say "release", "bump version", "publish", "cut a release", "ship it", or just "the bug is fixed, let's release". Handles uncommitted work, patch/minor/major version bumps, user-facing release notes, and the full release workflow.
---

# Obsidian Plugin Release

The plugin is in the official Obsidian community plugins. Obsidian finds updates by reading `manifest.json` on the repo's default branch and then downloading `main.js`, `manifest.json` and `styles.css` from the GitHub release whose tag equals that version. So a release is only live once **both** the bumped `manifest.json` is pushed to `main` **and** the matching GitHub release exists. Users then update from Settings → Community plugins in Obsidian.

## Step 1: Check for uncommitted changes (before anything else)

Work often gets finished in the same session as the release, so the source for the new feature may not be committed yet. Releasing without it would ship a `main.js` built from code that is not in the repo, or leave the feature out entirely. Check first:

```bash
git status --short
```

`git status` also lists untracked files (new source files), which `git diff` does not.

If anything is uncommitted or untracked, show the user the list, grouped (source in `src/`, `styles.css`, docs, tests, other) and ask: **"There are uncommitted local changes — should these be included in this release?"** Wait for the answer.

- **Yes** → commit them now as their own commit, *before* the version bump. Write a normal descriptive message about the change itself (e.g. `Add shorthand priorities and dates`), not a `Bump to…` message. Stage the files explicitly by name. Skip anything that must never be committed: `data.json` (holds the user's API token), `package-lock.json`, `node_modules/`, `TestVault/`. If you are unsure whether a file belongs, ask.
- **No** → leave them alone; the release is based only on committed work. Be aware `npm run build` still builds from the working tree, so if uncommitted `src/` changes exist, tell the user the built `main.js` would include them, and suggest stashing them (`git stash -u`) for the duration of the release, then `git stash pop` at the end.

If the working tree is clean, just continue.

## Step 2: Determine the release type

Look at what changed since the last release:

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

If there's no previous tag, use `git log --oneline`. Read the actual diffs of anything unclear — the release notes in Step 5 need to describe user-visible behavior, not commit titles.

| Type | When | Example |
|------|------|---------|
| **Patch** (3rd digit) | Bug fixes only, no new features | `2.0.0` → `2.0.1` |
| **Minor** (2nd digit) | New features, backwards compatible | `2.0.1` → `2.1.0` |
| **Major** (1st digit) | Breaking changes, major rewrites | `2.1.0` → `3.0.0` |

If it's not clear, summarize what changed and ask the user to confirm the release type.

## Step 3: Confirm the version

Read the current version from `manifest.json` and apply the bump (minor resets patch to 0; major resets minor and patch).

Tell the user: "I'll release **X.Y.Z** as a [patch/minor/major] release. This includes: [1-3 bullet summary]. Shall I proceed?" Wait for confirmation. If the user already confirmed the version and scope earlier in the conversation, don't ask again.

## Step 4: Describe what's new for users

Users decide whether to update, and learn how to use new features, from what they can read: the GitHub release notes and the README (the README is what Obsidian shows on the plugin's page in the community plugins browser). Make sure both tell them what's new:

- **Release notes** (used in Step 7): written for plugin users, not developers. For each new feature: what it does and a short example of how to use it (e.g. the markdown to type). Mention changed behavior users might notice, settings added, and notable fixes. Skip internal refactors, lint fixes and test-spec changes. For a patch, one or two sentences on what was fixed is enough. For a major, lead with breaking changes and what users need to do.
- **README**: check the new features are documented in the usage sections and the features list. For a minor or major release, add a short entry at the top of the "What's New" section in the README (create it right after the summary if it doesn't exist): a sub-heading `X.Y.Z` with 2–5 bullets, newest first. Match the README's existing heading levels. Keep only the last few versions there; older history lives in the GitHub releases.

Show the user the draft release notes. README changes are committed in Step 6 with the bump.

## Step 5: Bump versions

```bash
npm pkg set version=X.Y.Z
```

This updates `package.json`. Also edit `manifest.json` with the Edit tool so its `version` field matches exactly. Verify both show the same version.

If `minAppVersion` in `manifest.json` changed in this release, also add `"X.Y.Z": "<minAppVersion>"` to `versions.json` (create it if missing) — Obsidian uses it to offer older users a compatible version.

## Step 6: Build and commit

```bash
npm run build
```

If the build fails, stop and report the error. Don't release a broken build.

Commit the version bump (plus the README update from Step 4, and `versions.json` if changed). Never commit `package-lock.json`:

```bash
git add manifest.json package.json main.js README.md
git commit -m "Bump to vX.Y.Z: <short description of what changed>"
git push
```

Keep the description under 60 characters. The push matters: Obsidian reads the version from `manifest.json` on `main`.

## Step 7: Create the GitHub release

```bash
gh release create X.Y.Z main.js manifest.json styles.css \
  --title "X.Y.Z" \
  --notes "<release notes from Step 4>"
```

Obsidian requires the tag and title to be exactly the version **without** a `v` prefix (`2.0.3`, not `v2.0.3`) — it downloads the assets from the release whose tag matches `manifest.json`. All three assets must be attached, including `styles.css`.

For multi-line notes, write them to a file in the scratchpad and pass `--notes-file <path>` instead of `--notes`, to avoid shell quoting problems.

## Step 8: Confirm

Verify the release is live and has the assets:

```bash
gh release view X.Y.Z --json tagName,assets,url
```

Report the release URL. Tell the user that Obsidian users will see the update under Settings → Community plugins → "Check for updates" (Obsidian may take a little while to pick it up).
