---
name: release
description: Release a new version of an Obsidian plugin to GitHub so BRAT users can install it. Use this skill whenever the user wants to publish, release, bump, or ship a new version of their Obsidian plugin — whether they say "release", "bump version", "publish to BRAT", "cut a release", or just "the bug is fixed, let's release". Handles patch, minor, and major version bumps with the full release workflow.
---

# Obsidian Plugin Release

## Step 1: Determine the release type

First, look at what changed since the last release. Run both of these in parallel:

```bash
git log $(git describe --tags --abbrev=0)..HEAD --oneline
git diff --stat HEAD
```

If there's no previous tag, use `git log --oneline` to see all commits.

If `git diff --stat HEAD` shows uncommitted changes to source files (e.g. `src/`, `styles.css`), show them to the user and ask: "There are also uncommitted local changes — should these be included in this release?" Wait for their answer before continuing. If yes, factor them into the version bump decision and release notes. If no, proceed based only on the commits.

Based on the commits (and any confirmed local changes), determine the version bump:

| Type | When | Example |
|------|------|---------|-
| **Patch** (3rd digit) | Bug fixes only, no new features | `2.0.0` → `2.0.1` |
| **Minor** (2nd digit) | New features, backwards compatible | `2.0.1` → `2.1.0` |
| **Major** (1st digit) | Breaking changes, major rewrites | `2.1.0` → `3.0.0` |

If it's not clear from the commits, briefly summarize what changed and ask the user to confirm the release type before proceeding.

## Step 2: Calculate new version

Read the current version from `manifest.json` (the `version` field). Apply the bump.

For a patch bump of `2.0.1` → `2.0.2`, for a minor bump → `2.1.0` (reset patch to 0), for a major bump → `3.0.0` (reset minor and patch to 0).

Tell the user: "I'll release **vX.Y.Z** as a [patch/minor/major] release. This includes: [1-3 bullet summary of changes]. Shall I proceed?"

Wait for confirmation before continuing.

## Step 3: Bump versions

```bash
npm pkg set version=X.Y.Z
```

This updates `package.json`. Also update `manifest.json` — the `version` field must match exactly.

Edit `manifest.json` directly using the Edit tool to set `"version": "X.Y.Z"`.

Verify both files show the same version before continuing.

## Step 4: Build

```bash
npm run build
```

If the build fails, stop and report the error to the user. Do not proceed with a broken build.

## Step 5: Commit

Stage only the three files that should be committed. Never commit `package-lock.json` (it's gitignored, but be explicit):

```bash
git add manifest.json package.json main.js
git commit -m "Bump to vX.Y.Z: <short description of what changed>"
git push
```

The commit message format is `Bump to vX.Y.Z: <description>` — keep the description under 60 characters.

## Step 6: Create GitHub release

```bash
gh release create vX.Y.Z main.js manifest.json styles.css \
  --title "vX.Y.Z" \
  --notes "<release notes>"
```

For the release notes, write a brief human-readable summary of what changed. For a patch: one sentence on what was fixed. For a minor: bullet list of new features. For a major: summary of breaking changes and migration notes if any.

**Important:** BRAT installs plugins from GitHub releases, not from commits. This step is required for users to get the update.

## Step 7: Confirm

Report the release URL back to the user and confirm it's live.
