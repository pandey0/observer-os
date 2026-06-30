# GitHub Workflow & Release Process

How CI, publishing, and version management work in this repo.

---

## Overview

Two GitHub Actions workflows live in `.github/workflows/`:

| File | Triggers | Purpose |
|---|---|---|
| `ci.yml` | Every push to `main`, every PR | Typecheck → build → test |
| `publish.yml` | Every push to `main` | Detect changesets → open Release PR → publish to npm |

---

## Workflow 1 — CI (`ci.yml`)

Runs on every push and every pull request targeting `main`.

```
push / PR opened
      ↓
GitHub Actions (ubuntu-latest, Node 20, pnpm 9)
      ↓
pnpm install --frozen-lockfile
      ↓
pnpm typecheck    ← TypeScript errors across all 19 packages
      ↓
pnpm build        ← full monorepo build via Turbo (respects dependency order)
      ↓
pnpm test         ← all vitest suites
      ↓
✓ green → PR safe to merge
✗ red   → PR blocked until fixed
```

No manual steps. Every PR must be green before it can merge.

---

## Workflow 2 — Publish (`publish.yml`)

Runs on every push to `main`. Uses the [Changesets](https://github.com/changesets/changesets) action.

Behavior depends on whether unreleased changesets exist:

### Path A — Changesets present (new release pending)

```
merge to main
      ↓
Changesets action reads .changeset/*.md files
      ↓
Opens (or updates) a PR: "chore: release packages"
  └─ bumps version numbers in all affected package.json files
  └─ generates CHANGELOG.md entries in each package
      ↓
You review the PR → merge it
      ↓
Changesets action publishes all changed packages to npm
  └─ uses NPM_TOKEN secret for authentication
  └─ creates git tags: @observer-os/daemon@1.2.0, etc.
```

### Path B — No changesets

```
merge to main
      ↓
Changesets action: nothing pending → skips publish
```

---

## Day-to-Day Release Flow

### Step 1 — Make your change

Write code, fix a bug, add a feature. Normal development.

### Step 2 — Create a changeset

```bash
pnpm changeset
```

Interactive prompt:
- Which packages changed? (select from list)
- How severe? `patch` (bug fix) / `minor` (new feature) / `major` (breaking change)
- Describe the change in plain English

This creates a file like `.changeset/happy-lions-dance.md`:

```markdown
---
"@observer-os/auto-instrument": patch
"@observer-os/daemon": patch
---

Fix SQL double-fire when both Pool and Client were patched.
```

### Step 3 — Commit and push

```bash
git add .changeset/happy-lions-dance.md
git commit -m "fix: sql double-fire in auto-instrument"
git push
```

### Step 4 — CI runs

GitHub Actions runs typecheck + build + test on your branch. Must be green.

### Step 5 — Merge PR to main

Changesets action automatically opens a **"chore: release packages"** PR with all version bumps and CHANGELOG entries pre-filled.

### Step 6 — Review and merge the Release PR

Check the version bumps look correct → merge. Publish fires automatically.

---

## Versioning Strategy

All 19 packages are **linked** — they always release at the same version number. If `auto-instrument` bumps from `1.1.0` to `1.2.0`, all other packages bump too.

This is configured in `.changeset/config.json`:

```json
{
  "linked": [["@observer-os/core", "@observer-os/sdk", "@observer-os/auto-instrument", ...]],
  "access": "public",
  "baseBranch": "main"
}
```

Bump severity guide:
- `patch` — bug fix, no API change (1.1.0 → 1.1.1)
- `minor` — new feature, backwards compatible (1.1.0 → 1.2.0)
- `major` — breaking API change (1.1.0 → 2.0.0)

---

## Secrets

| Secret | Where set | Used by | Purpose |
|---|---|---|---|
| `NPM_TOKEN` | GitHub repo settings → Secrets | `publish.yml` | Authenticates `npm publish` without interactive login |
| `GITHUB_TOKEN` | Auto-provided by GitHub | `publish.yml` | Opens and commits to the Release PR |

`GITHUB_TOKEN` is automatic — GitHub injects it, nothing to configure.

To update `NPM_TOKEN`:
1. Go to `https://www.npmjs.com/settings/<username>/tokens`
2. Generate new **Automation** token
3. Go to `https://github.com/pandey0/observer-os/settings/secrets/actions`
4. Update `NPM_TOKEN`

Or via CLI:
```bash
echo "npm_your_token_here" | gh secret set NPM_TOKEN --repo pandey0/observer-os
```

---

## What Never Needs to Be Done Manually

| Task | Who does it |
|---|---|
| `npm publish` | Changesets action |
| Version bumps in package.json | Changesets action |
| CHANGELOG.md entries | Changesets action |
| Git tags (`@observer-os/daemon@1.2.0`) | Changesets action |
| Typecheck / test on PRs | CI workflow |

---

## Repo Links

| Resource | URL |
|---|---|
| Repository | https://github.com/pandey0/observer-os |
| Actions | https://github.com/pandey0/observer-os/actions |
| Secrets | https://github.com/pandey0/observer-os/settings/secrets/actions |
| npm packages | https://www.npmjs.com/org/observer-os |
