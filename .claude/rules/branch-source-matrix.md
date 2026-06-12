# Branch Source Matrix (semantic-release)

**main HEAD is the single release source.** semantic-release analyzes commit history on every push to main and decides whether to bump, tag, and publish. The previous `main → production` / `main → beta/open-vsx` sync flow is **retired** — replaced by the semantic-release migration on main (vscode + npm lines).

## Source → tag → publish matrix

| Source branch   | Workflow                                                                   | Tag prefix               | Publish target                                                                                                                  | Config                |
| --------------- | -------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **`main`**      | `main-semantic-release.yml`                                                | `vscode-v<X.Y.Z>`        | Open VSX `claude-sessions` + VS Code Marketplace `es6kr.claude-sessions` (via `release-vscode.yml` chain)                       | `.releaserc.json`     |
| **`main`**      | `npm-semantic-release.yml`                                                 | `v<X.Y.Z>`               | npm (`@claude-sessions/core`, `@claude-sessions/ui`, `@claude-sessions/web`, `claude-sessions-mcp`) via `publish-npm.yml` chain | `.releaserc-npm.json` |
| **`beta`**      | (TBD — release-please retired, semantic-release prerelease config pending) | `v<X.Y.Z>-beta.N`        | npm `beta` dist-tag                                                                                                             | (TBD)                 |
| **`ovsx-beta`** | (TBD — release-please retired)                                             | `vscode-v<X.Y.Z>-beta.N` | Open VSX `claude-sessions-vscode` (separate listing)                                                                            | (TBD)                 |

## How releases happen

1. Commit lands on `main` (PR merge or direct push).
2. Both `main-semantic-release.yml` and `npm-semantic-release.yml` trigger on `push: branches: [main]`.
3. Each waits for its `production-vscode` / `production-npm` environment reviewer approval.
4. On approval, `semantic-release` analyzes commits since the matching `tagFormat` baseline, picks a bump per `releaseRules`, pushes a release commit + tag back to `main`, and lets the downstream `release-vscode.yml` / `publish-npm.yml` workflows handle the actual publish on the tag push event.
5. Manual `pnpm version` / `vsce package` / `npm publish` is **not** the standard path — see `publishing.md` "직접 배포 금지" + `~/.agents/rules/release-automation.md` "Manual publish gate".

## Scope filter — white-list approach

| Config                     | Scope rules                                                                                       | Bump on                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `.releaserc.json` (vscode) | `scope=vscode` or `scope=core` only                                                               | `feat/fix/perf` matching scope, `BREAKING CHANGE` (any scope) |
| `.releaserc-npm.json`      | TBD — currently negative scope filter; planned to migrate to white-list (`scope=core/ui/web/mcp`) | `feat/fix/perf` matching scope, `BREAKING CHANGE`             |

Catch-all `{ release: false }` ensures unrelated scopes (`fix(ci)`, `chore(deps)`, etc.) do not trigger a bump on the wrong line. Verifying the matrix before approving each `production-*` environment is mandatory — see `~/.agents/rules/release-automation.md` "Production environment 승인 직전 dry-run 의무".

## Don't / Do

| #   | Don't                                                                             | Do                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Manually create a `v0.4.x` or `vscode-v0.4.x` tag on `main` HEAD                  | Let `semantic-release` produce the tag from `main` push + production environment approval. The tag commit will be the auto-generated `chore(release): ...` commit                         |
| 2   | Sync `main → production` or `main → beta/open-vsx` for a release                  | Those branches are retired. Push to `main`, approve the production environment, semantic-release handles the rest                                                                         |
| 3   | Run `pnpm version` to bump root + packages, then `git tag` + push                 | Use a `feat(vscode):` / `fix(<npm-scope>):` commit. semantic-release bumps + tags automatically based on `releaseRules`                                                                   |
| 4   | Approve a `production-vscode` / `production-npm` deployment without dry-run       | Run the dry-run procedure from `release-automation.md` (releaseRules Read → commits enumerate → next-version compute) before approving                                                    |
| 5   | Use `gh workflow run publish-npm.yml -f package=all` as an emergency publish path | Manual workflow_dispatch is an escape hatch (with mandatory pending-run check per `release-automation.md` "Manual publish gate"). Default path is always commit → main → semantic-release |

## Pre-push self-check (every push to `main`)

1. Did you intend to trigger a release? — If yes, the commit's `type(scope)` must match the corresponding config's white-list rules.
2. Will semantic-release pick a bump? — If unsure, run the dry-run procedure from `release-automation.md` before pushing.
3. Are both `production-vscode` and `production-npm` reviewer approvals expected? — Confirm both workflows trigger and decide approval per workflow.

## Related

- `~/.agents/rules/release-automation.md` — global rules for `release-please` / `semantic-release` / `changesets` (close-recommendation gate, manual publish gate, production environment dry-run).
- `publishing.md` (same dir) — "직접 배포 금지" rule + tag-push convention.
- `claude-code-sessions.md` (`~/ghq/github.com/es6kr/.claude/rules/`) — beta release flow (currently mid-migration to semantic-release).
