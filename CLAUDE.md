# CLAUDE.md

Claude Code sessions monorepo - Effect-TS based session management library

## Project Structure

- `packages/core` - Core library (npm: @claude-sessions/core)
- `packages/web` - SvelteKit web UI (npm: @claude-sessions/web)

## Important: Open Source Project

This is an **English-only open source project**:

- All code comments, variable names, commit messages in English
- Documentation in English
- Include `-s` flag when committing (sign-off)

## Development Workflow

### Permanent Records & Public Actions Policy

**CRITICAL**: GitHub comments, PR/Issue modifications, and Git pushes leave permanent traces that cannot be fully erased (e.g., "comment deleted" logs).
ALWAYS use `notify_user` (or `AskUserQuestion`) to get explicit confirmation BEFORE:

- **GitHub API Actions**: Posting or editing comments, labels, milestones, or issue states.
- **Git Push**: Amending commits, force pushing, or pushing corrections for previous mistakes.
- **VSIX/NPM Publishing**: Any action that results in a new public artifact version.
- **Workflow Changes**: Modifying CI/CD pipelines or branch protection rules.

### Version Management & Release Flow

Stable releases for **npm group** (core/ui/web/mcp) and **vscode-extension** are managed by
[release-please](https://github.com/googleapis/release-please). Beta releases follow two paths:

| Track                     | Branch | Mechanism                                                                                   | Result                                                  |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| npm stable                | `main` | release-please Release PR → merge                                                           | tag `v<X.Y.Z>` → `publish-npm.yml` publishes            |
| vscode-extension stable   | `main` | release-please Release PR → merge                                                           | tag `vscode-v<X.Y.Z>` → `release-vscode.yml` publishes  |
| npm beta                  | `beta` | release-please-beta Release PR → merge                                                      | tag `v<X.Y.Z>-beta.<N>` → npm publish with `--tag beta` |
| **vscode-extension beta** | (any)  | **manual** — `git tag vscode-v<X.Y.Z>-beta.<N> && git push origin vscode-v<X.Y.Z>-beta.<N>` | release-vscode.yml publishes (Open VSX only, name swap) |

#### Promotion: `beta → main`

When a beta cycle stabilizes, merge `beta` into `main` (fast-forward preferred; merge-commit
acceptable). **Do not rebase `beta` onto `main` for promotion** — rewriting commit hashes
confuses release-please's release-marker tracking.

```bash
git checkout main
git merge --ff-only beta   # or --no-ff for a promotion marker
git push origin main
```

After the promotion, sync `main → beta` for any subsequent hotfix to keep `beta` ahead.

#### Manual emergency bumps (rare)

Direct `pnpm version` remains available for hotfixes that bypass release-please:

```bash
pnpm version patch       # 0.5.0 -> 0.5.1 across npm group
git tag v0.5.1
git push origin v0.5.1
```

`publish-npm.yml`'s tag-override step rewrites all 4 npm package.json from the tag, so manual
tagging works even if package.json files are out of sync.

#### Conventional Commits drive the bump type

| Type                                               | Bump    |
| -------------------------------------------------- | ------- |
| `feat`                                             | minor   |
| `fix`, `perf`                                      | patch   |
| `BREAKING CHANGE` (or `!` suffix)                  | major   |
| `chore`, `docs`, `test`, `refactor`, `style`, `ci` | no bump |

### Web UI Testing

After modifying web features, always test with Playwright:

1. Start dev server: `pnpm dev`
2. Test functionality with Playwright
3. **Keep browser open** for user verification (don't close)

## Refactoring

리팩토링 시 `refactor-comparison` 에이전트 사용 → 순수함수 vs Effect 비교 분석

## Session Summary Architecture

**CRITICAL**: Understanding how summaries work is essential for matching official extension behavior.

- Summary records have `leafUuid` but **no timestamp**
- `leafUuid` points to a message in **another session** (cross-session reference)
- The timestamp for sorting/display must be derived from the **target message's timestamp**
- Official extension calculates relative time based on `leafUuid`'s target message timestamp

```
Session A (contains summary):
  { type: "summary", summary: "...", leafUuid: "abc123" }  // no timestamp!

Session B (contains target message):
  { uuid: "abc123", timestamp: "2025-12-26T12:57:25.141Z" }  // this is the timestamp to use
```

When matching official extension's session list order and relative time display, use `leafUuid` resolution to get the correct timestamp.

## Title Message Architecture

`custom-title` and `agent-name` JSONL records have **no `uuid` field**:

```
{"type":"custom-title","customTitle":"My Title","sessionId":"abc123"}
{"type":"agent-name","agentName":"Agent Task","sessionId":"abc123"}
```

- Standard uuid-based APIs (`deleteMessage`, `updateCustomTitle`) **cannot target these messages**
- Use **line-index-based** operations: `deleteTitleMessageByIndex`, `updateTitleMessageByIndex`
- The web API accepts `lineIndex` query parameter for `DELETE` and `PATCH /api/message`
- **Rename Session** modifies both `custom-title` and `agent-name` records simultaneously

## Tech Stack

- **Core**: TypeScript, Effect-TS
- **Web**: SvelteKit 5, TailwindCSS 4, adapter-node
- **Build**: tsup, Vite
- **Package Manager**: pnpm workspace

## Commands

```bash
# Full build
pnpm build

# Core package
cd packages/core
pnpm build
pnpm test

# Web package
cd packages/web
pnpm dev      # Dev server
pnpm build    # Production build
```

## VSCode Extension Workflow

**IMPORTANT**: After modifying any files in `packages/core/` or `packages/vscode-extension/`, use `/vsix` slash command to rebuild and reinstall.

This applies to:

- `packages/core/src/*.ts` - Core library source
- `packages/vscode-extension/src/*.ts` - Extension source
- `packages/vscode-extension/package.json` - Extension manifest

**Note**: A PostToolUse hook marks rebuild needed, but explicit "vsix 빌드" request should trigger immediate rebuild.
