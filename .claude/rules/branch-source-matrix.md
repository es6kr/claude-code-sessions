# Branch Source Matrix (semantic-release, channel:next model)

**Two long-lived release branches**: `main` (pre-release, dist-tag `next` / Marketplace Pre-Release Version) and `production` (stable, dist-tag `latest` / Marketplace stable).

Every push to either branch triggers both semantic-release lines (vscode + npm). semantic-release picks the channel per `branches` config in `.releaserc.json` / `.releaserc-npm.json` and pushes a channel-appropriate tag. Downstream `release-vscode.yml` / `publish-npm.yml` inspect the tag pattern (`-next.N` suffix) and publish with the correct flag (`--pre-release` / `--tag next`).

## Source → tag → publish matrix

| Source branch    | Workflow                    | Tag pattern              | Env (approval gate) | Publish target                                                                                                        | Config                                                                                       |
| ---------------- | --------------------------- | ------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **`production`** | `main-semantic-release.yml` | `vscode-v<X.Y.Z>`        | `production-vscode` | Open VSX `claude-sessions` + VS Code Marketplace `es6kr.claude-sessions` (stable) via `release-vscode.yml`            | `.releaserc.json` (`branches[0]: "production"`)                                              |
| **`production`** | `npm-semantic-release.yml`  | `v<X.Y.Z>`               | `production-npm`    | npm `latest` dist-tag (`@claude-sessions/core`, `@claude-sessions/ui`, `@claude-sessions/web`, `claude-sessions-mcp`) | `.releaserc-npm.json` (`branches[0]: "production"`)                                          |
| **`main`**       | `main-semantic-release.yml` | `vscode-v<X.Y.Z>-next.N` | `next-vscode`       | Open VSX + VS Code Marketplace **Pre-Release Version** channel (`--pre-release` flag) via `release-vscode.yml`        | `.releaserc.json` (`branches[1]: { name: "main", channel: "next", prerelease: "next" }`)     |
| **`main`**       | `npm-semantic-release.yml`  | `v<X.Y.Z>-next.N`        | `next-npm`          | npm `next` dist-tag                                                                                                   | `.releaserc-npm.json` (`branches[1]: { name: "main", channel: "next", prerelease: "next" }`) |

### Environment separation

`main-semantic-release.yml` and `npm-semantic-release.yml` pick the GitHub Actions environment per pushed ref:

- `refs/heads/production` → `production-vscode` / `production-npm` (stable-tier reviewers)
- everything else (i.e. `refs/heads/main`) → `next-vscode` / `next-npm` (pre-release reviewers or auto-proceed depending on how the environment is configured in the repo)

Rationale: stable publishes and pre-release publishes belong to different approval domains. Reusing `production-*` for pre-release runs mis-signals "production release incoming" in the approval UI. Setting up the two `next-*` environments in the repo (Settings → Environments) is a one-time GitHub operation; empty environments still act as an audit checkpoint.

## Downstream tag discrimination

`release-vscode.yml` and `publish-npm.yml` inspect the pushed tag pattern:

- `vscode-vX.Y.Z-next.N` / `vX.Y.Z-next.N` → pre-release publish (`vsce publish --pre-release`, `ovsx publish --pre-release`, `pnpm publish --tag next`)
- Plain `vscode-vX.Y.Z` / `vX.Y.Z` → stable publish (no `--pre-release`, `pnpm publish --tag latest`)

Legacy `-beta.N` tags remain supported by `publish-npm.yml` (maps to `--tag beta`) for backward compatibility, but the `beta` branch and beta channel are retired.

## How releases happen

1. Commit lands on `main` (PR merge or direct push). `main` = active development + auto pre-release.
2. Both `main-semantic-release.yml` and `npm-semantic-release.yml` trigger on `push: main` (or `push: production` for stable).
3. Each waits for `production-vscode` / `production-npm` environment reviewer approval.
4. On approval, `semantic-release` analyzes commits since the channel's `tagFormat` baseline, picks a bump per `releaseRules`, pushes a release commit + tag (`-next.N` for main, plain for production) back to the source branch.
5. Downstream `release-vscode.yml` / `publish-npm.yml` triggers on the tag push, discriminates `-next.N` suffix, and publishes to the appropriate channel.
6. Manual `pnpm version` / `vsce package` / `npm publish` is **not** the standard path — see `publishing.md` "직접 배포 금지" + `~/.agents/rules/release-automation.md` "Manual publish gate".

## Production promotion

To ship a stable release, promote commits from `main` to `production`:

- Preferred: create a promotion PR (`main` → `production`) after `main`'s pre-release is verified in Marketplace Pre-Release channel + npm `next` dist-tag.
- Direct push is blocked by branch protection (require PR approval + status check).

Promotion cadence is a team decision — pre-release track on `main` is designed to accumulate multiple `-next.N` before graduating.

## Scope filter — white-list approach

| Config                     | Scope rules                                                                                                                                               | Bump on                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `.releaserc.json` (vscode) | `scope=vscode` or `scope=core` only                                                                                                                       | `feat/fix/perf` matching scope, `BREAKING CHANGE` (any scope)          |
| `.releaserc-npm.json`      | negative scope filter — `(vscode)`-scoped commits are blocked; all other `feat/fix/perf/chore/refactor/docs/test/ci` match the catch-all `release: patch` | `feat/fix/perf/etc.` (non-vscode scope), `BREAKING CHANGE` (any scope) |

Catch-all `{ release: false }` ensures unrelated scopes (`fix(ci)`, `chore(deps)`, etc.) do not trigger a bump on the wrong line. Verifying the matrix before approving each `production-*` environment is mandatory — see `~/.agents/rules/release-automation.md` "Production environment 승인 직전 dry-run 의무".

## Don't / Do

| #   | Don't                                                                                                                                              | Do                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Manually create a `v0.4.x` or `vscode-v0.4.x` tag on any branch                                                                                    | Let `semantic-release` produce the tag from a `main` or `production` push + environment approval. The tag commit will be the auto-generated `chore(release): ...` commit                                                                                                                                                                                                                       |
| 2   | Push a feature commit directly to `production` for a hotfix                                                                                        | Even hotfixes route through `main` → verified as `-next.N` in pre-release channel → promoted to `production`. Emergency exceptions require explicit user approval + note in commit body                                                                                                                                                                                                        |
| 3   | Use `beta` branch or `ovsx-beta` branch                                                                                                            | Retired. `main` is now the pre-release source (channel:next). Any push to `beta`/`ovsx-beta` is orphan and will not trigger any release workflow                                                                                                                                                                                                                                               |
| 4   | Approve a `production-vscode` / `production-npm` deployment without dry-run                                                                        | Run the dry-run procedure from `~/.agents/rules/release-automation.md` (releaseRules Read → commits enumerate → next-version compute) before approving. For `main` (pre-release), verify next-version has `-next.N` suffix; for `production`, plain `vX.Y.Z`                                                                                                                                   |
| 5   | Approve two consecutive `main` releases without checking the Marketplace UI                                                                        | Marketplace pre-release channel updates propagate to users' "Update to Pre-Release Version" prompt — approve pacing must match user tolerance                                                                                                                                                                                                                                                  |
| 6   | Use `gh workflow run publish-npm.yml -f package=all` as an emergency publish path                                                                  | Manual workflow_dispatch is an escape hatch (with mandatory pending-run check per `release-automation.md` "Manual publish gate"). Default path is always commit → main/production push → semantic-release                                                                                                                                                                                      |
| 7   | Assistant autonomously create / push / protect the `production` branch (or `master` / `release` / `prod` / `stable`) as a "config completion step" | `production` is a real-user release trigger. Assistant NEVER touches it without explicit user instruction. PreToolUse hook `~/.agents/skills/hook-kit/resources/block-prod-branch-autonomous-ops.sh` enforces this deterministically. To proceed after explicit approval, prefix `ALLOW_PROD_BRANCH_OPS=1 <cmd>` per-command. See `publishing.md` "Release-trigger 브랜치 자율 조작 절대 금지" |

## Pre-push self-check (every push to `main` or `production`)

1. Did you intend to trigger a release? — If yes, the commit's `type(scope)` must match the corresponding config's white-list rules.
2. Will semantic-release pick a bump? — If unsure, run the dry-run procedure from `~/.agents/rules/release-automation.md` before pushing.
3. Which channel? — `main` push → `-next.N` pre-release. `production` push → plain stable.
4. Are both `production-vscode` and `production-npm` reviewer approvals expected? — Confirm both workflows trigger and decide approval per workflow.

## Related

- `~/.agents/rules/release-automation.md` — global rules for `release-please` / `semantic-release` / `changesets` (close-recommendation gate, manual publish gate, production environment dry-run).
- `publishing.md` (same dir) — "직접 배포 금지" rule + tag-push convention.
- `.ralph/docs/generated/plan-release-branch-strategy.md` — Option D design rationale + tradeoff analysis.
