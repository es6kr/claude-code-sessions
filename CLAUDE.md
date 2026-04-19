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

### Version Management

Always use `npm version` command for version bumps:

```bash
# Patch version (0.1.5 -> 0.1.6)
pnpm version patch

# Minor version (0.1.5 -> 0.2.0)
pnpm version minor

# Specific version
pnpm version 0.2.0
```

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
