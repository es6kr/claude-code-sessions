/**
 * Pure-function helpers for the resume-session decision flow.
 *
 * Extracted from extension.ts so the picker shape and the direct-open dispatch
 * can be unit-tested without booting the VSCode test-electron host. The runtime
 * caller passes the already-resolved `cwd` and `workspaceFolders` (mapped to
 * `WorkspaceFolderLike` to keep this file free of vscode imports).
 *
 * Discussion #159 — 3-way picker (Internal / External / Claude Code Extension).
 *
 * anthropic.claude-code resolves sessions against the active workspace cwd only:
 * if the session's project cwd is not exactly one of the open workspace folder
 * paths, its URI handler loads an empty session. The picker hides ANTHROPIC
 * up front in that case (better UX — no dead-end selection path); a fallback
 * picker is shown if `defaultTerminalMode === 'anthropic'` would have skipped
 * the picker entirely.
 */

export interface WorkspaceFolderLike {
  uri: { fsPath: string }
}

export type ResumeMode = 'internal' | 'external' | 'anthropic'

export type DefaultTerminalMode = 'ask' | ResumeMode

export type ResumeDecision =
  | { kind: 'direct'; mode: ResumeMode }
  | { kind: 'picker'; options: ReadonlyArray<ResumeMode> }
  | { kind: 'fallback-picker'; options: ReadonlyArray<ResumeMode>; reason: 'cross-workspace' }

/**
 * Canonicalize a path for equality comparison only (both sides of every
 * comparison pass through this function): lowercase (Windows drive/case
 * insensitivity), unify separators, and trim trailing separators.
 *
 * Invariant note: neither producer normally emits a trailing separator —
 * `vscode.Uri.fsPath` strips them (except for filesystem roots like "/" or
 * "C:\"), and session cwd values come from `process.cwd()` which does the
 * same. The trim is defensive for cwd values recorded by other tools. A
 * single-character root ("/") is kept as-is; "c:/" trims to "c:" which stays
 * equality-consistent because both comparands are normalized identically.
 */
export function normalizeWorkspacePath(p: string): string {
  const unified = p.toLowerCase().replace(/\\/g, '/')
  return unified.length > 1 ? unified.replace(/\/+$/, '') : unified
}

/**
 * `true` iff the session cwd matches the **primary workspace folder
 * (folders[0])**. anthropic.claude-code resolves sessions against the primary
 * workspace only — additional roots in a multi-root workspace do NOT enable
 * anthropic to resolve a session whose cwd lives outside folders[0]. Treats
 * null/empty cwd and empty folders as no-match. Windows case-mismatched drive
 * letters are normalized.
 *
 * Function name retains `…AnyWorkspaceFolder` for backward compatibility with
 * existing call sites; semantics are folders[0]-only.
 */
export function matchesAnyWorkspaceFolder(
  cwd: string | null | undefined,
  folders: ReadonlyArray<WorkspaceFolderLike>
): boolean {
  if (!cwd) return false
  const primary = folders[0]
  if (!primary) return false
  return normalizeWorkspacePath(primary.uri.fsPath) === normalizeWorkspacePath(cwd)
}

/**
 * `true` iff the picker should hide ANTHROPIC_OPTION for this session. The
 * exact rule is: hide unless the session cwd matches at least one open
 * workspace folder. This collapses every "anthropic cannot resolve" case
 * (no folders open, folders open but none match, no cwd) into one boolean.
 */
export function isCrossWorkspace(
  cwd: string | null | undefined,
  folders: ReadonlyArray<WorkspaceFolderLike>
): boolean {
  return !matchesAnyWorkspaceFolder(cwd, folders)
}

/**
 * Picker option list given the cross-workspace flag. Cross → 2 options
 * (Internal / External). Same-workspace → 3 options (Internal / External /
 * Anthropic).
 *
 * The ordering is deliberate: the established terminal flavors come first and
 * the Claude Code Extension entry stays last. Promote it only on real UX
 * feedback — reordering here is the single place that changes the picker.
 */
export function pickerOptions(crossWorkspace: boolean): ReadonlyArray<ResumeMode> {
  return crossWorkspace ? ['internal', 'external'] : ['internal', 'external', 'anthropic']
}

/**
 * Decide what the resume-session command should do for the given input.
 *
 * The three user-named scenarios:
 *   A) `defaultMode === 'ask'` + cross-workspace  → picker with 2 options
 *   B) `defaultMode === 'ask'` + same-workspace   → picker with 3 options
 *   C) `defaultMode === 'anthropic'` + same-workspace → direct anthropic open
 *
 * Bonus:
 *   D) `defaultMode === 'anthropic'` + cross-workspace → fallback picker
 *      (2 options) — the user pre-configured anthropic but the session can't
 *      resolve there; fall back to terminal flavor instead of silently
 *      reverting one of internal/external for them.
 *
 * Terminal defaults (`internal` / `external`) always dispatch directly — they
 * do not care about workspace match.
 */
export function decideResume(input: {
  defaultMode: DefaultTerminalMode
  cwd: string | null | undefined
  folders: ReadonlyArray<WorkspaceFolderLike>
}): ResumeDecision {
  const cross = isCrossWorkspace(input.cwd, input.folders)

  if (input.defaultMode === 'internal' || input.defaultMode === 'external') {
    return { kind: 'direct', mode: input.defaultMode }
  }

  if (input.defaultMode === 'anthropic') {
    if (cross) {
      return {
        kind: 'fallback-picker',
        options: pickerOptions(true),
        reason: 'cross-workspace',
      }
    }
    return { kind: 'direct', mode: 'anthropic' }
  }

  // defaultMode === 'ask' — picker with 2 or 3 options
  return { kind: 'picker', options: pickerOptions(cross) }
}
