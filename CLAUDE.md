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
[release-please](https://github.com/googleapis/release-please). Beta releases follow three
parallel paths — each on a dedicated branch so the npm beta cycle and the vscode-extension
beta cycle never block each other:

| Track                   | Branch      | Mechanism                                     | Result                                                                                     |
| ----------------------- | ----------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| npm stable              | `main`      | release-please Release PR → merge             | tag `v<X.Y.Z>` → `publish-npm.yml` publishes                                               |
| vscode-extension stable | `main`      | release-please Release PR → merge             | tag `vscode-v<X.Y.Z>` → `release-vscode.yml` publishes (Marketplace + Open VSX)            |
| npm beta                | `beta`      | release-please-beta Release PR → merge        | tag `v<X.Y.Z>-beta.<N>` → npm publish with `--tag beta`                                    |
| vscode-extension beta   | `ovsx-beta` | release-please-vscode-beta Release PR → merge | tag `vscode-v<X.Y.Z>-beta.<N>` → `release-vscode.yml` publishes (Open VSX only, name swap) |

#### `ovsx-beta` branch — vscode-extension beta only

The dedicated `ovsx-beta` branch isolates vscode-extension beta releases from the npm beta
cycle. The flow:

1. Land a `feat(vscode):` / `fix(vscode):` commit on `ovsx-beta` (either direct, via PR, or via sync from `main`).
2. `release-please-vscode-beta.yml` opens a Release PR titled `chore(vscode): release vscode-extension beta <X.Y.Z>-beta.<N>`.
3. Merge the Release PR → release-please creates tag `vscode-v<X.Y.Z>-beta.<N>`.
4. `release-vscode.yml` detects the `-beta.` suffix in the tag, swaps the package name to `claude-sessions-vscode`, skips the Marketplace publish, and publishes only to Open VSX.

Branch-source-matrix rule: `vscode-v<X.Y.Z>-beta.<N>` tags **MUST** come from `ovsx-beta`.
Tagging from `main` would publish a beta with the production package name, polluting the
production Marketplace listing.

#### Promotion: beta branches → `main`

When a beta cycle stabilizes, merge the relevant beta branch into `main` (fast-forward
preferred; merge-commit acceptable). **Do not rebase a beta branch onto `main`** — rewriting
commit hashes confuses release-please's release-marker tracking.

```bash
git checkout main
git merge --ff-only beta         # npm group promotion
git merge --ff-only ovsx-beta    # vscode-extension promotion
git push origin main
```

After the promotion, sync `main → <beta branch>` for any subsequent hotfix to keep the beta
branch ahead.

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

## Publishing

### Registry Mapping

| Registry                                  | Extension Name           | Purpose                   |
| ----------------------------------------- | ------------------------ | ------------------------- |
| VS Code Marketplace                       | `es6kr.claude-sessions`  | Production releases       |
| Open VSX (`es6kr/claude-sessions`)        | `claude-sessions`        | Production releases       |
| Open VSX (`es6kr/claude-sessions-vscode`) | `claude-sessions-vscode` | **Beta/pre-release only** |

### Beta Release to Open VSX

Beta versions go to the **separate** `claude-sessions-vscode` listing (not the production `claude-sessions`):

1. **Use beta branch** - Beta settings (name change, versioning) are maintained in the `beta` branch
2. Change `name` in `packages/vscode-extension/package.json` to `claude-sessions-vscode`
3. Package: `npx vsce package --no-dependencies`
4. Publish: `npx ovsx publish <file>.vsix -p $OVSX_PAT`

### Production Release

Production goes through CI (`release-vscode.yml`) via tag push `vscode-v*`. Publishes to both VS Code Marketplace and Open VSX `claude-sessions`.

## VSCode Extension Workflow

**IMPORTANT**: After modifying any files in `packages/core/` or `packages/vscode-extension/`, use `/vsix` slash command to rebuild and reinstall.

This applies to:

- `packages/core/src/*.ts` - Core library source
- `packages/vscode-extension/src/*.ts` - Extension source
- `packages/vscode-extension/package.json` - Extension manifest

**Note**: A PostToolUse hook marks rebuild needed, but explicit "vsix 빌드" request should trigger immediate rebuild.

### Beta Deploy (Open VSX)

`vsix-beta` 브랜치에 베타 패키징 커밋(`DO NOT PUSH: beta packaging`)이 존재함. 배포 요청 시:

1. `git show vsix-beta:packages/vscode-extension/package.json`로 현재 베타 버전 확인
2. production에서 vsix-beta 브랜치를 rebase하여 최신 코드 반영
3. 버전 범프 필요 시 beta.N 증가 (`pnpm version prerelease --preid beta`)
4. `pnpm build && vsce package --no-dependencies` → `npx ovsx publish`
