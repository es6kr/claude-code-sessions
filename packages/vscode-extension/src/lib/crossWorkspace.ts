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

export interface ClaudeExtensionLike {
  readonly isActive: boolean
  activate(): PromiseLike<unknown>
}

export interface EnsureClaudeCodeExtensionDeps {
  getExtension: (id: string) => ClaudeExtensionLike | undefined
  showWarningMessage: (message: string, ...items: string[]) => PromiseLike<string | undefined>
  installExtension: (id: string) => PromiseLike<unknown>
  showInformationMessage: (message: string) => void
  showErrorMessage: (message: string) => void
}

export type EnsureClaudeCodeExtensionResult =
  | { kind: 'ready'; extension: ClaudeExtensionLike }
  | { kind: 'declined' }
  | { kind: 'install-pending' }
  | { kind: 'activation-failed'; error: string }

const ANTHROPIC_EXTENSION_ID = 'anthropic.claude-code'

/**
 * Ensure the official Claude Code extension is installed and active,
 * prompting to install it on demand.
 *
 * Extracted from resumeSession's anthropic branch so it can be unit-tested
 * with mock deps instead of requiring a live open workspace folder in the
 * test-electron host — the anthropic branch is otherwise unreachable there,
 * since `decideResume` always routes cross-workspace when no folder is open.
 * Deps are typed structurally (PromiseLike, not vscode.Thenable) to keep this
 * file free of vscode imports, matching the rest of the module.
 */
export async function ensureClaudeCodeExtension(
  deps: EnsureClaudeCodeExtensionDeps
): Promise<EnsureClaudeCodeExtensionResult> {
  let ext = deps.getExtension(ANTHROPIC_EXTENSION_ID)

  if (!ext) {
    const choice = await deps.showWarningMessage(
      'The official Claude Code extension is not installed.',
      'Install',
      'Cancel'
    )
    if (choice !== 'Install') return { kind: 'declined' }

    await deps.installExtension(ANTHROPIC_EXTENSION_ID)

    // Auto-continue: pick up the freshly installed extension and fall through
    // to activation, so the original resume intent completes without a
    // second manual trigger.
    ext = deps.getExtension(ANTHROPIC_EXTENSION_ID)
    if (!ext) {
      // The extension host has not surfaced the new install yet — the one
      // remaining case where a manual re-trigger is required.
      deps.showInformationMessage(
        'Claude Code extension installed — run Resume Session again to open the session.'
      )
      return { kind: 'install-pending' }
    }
  }

  if (!ext.isActive) {
    try {
      await ext.activate()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      deps.showErrorMessage(`Failed to activate Claude Code extension: ${message}`)
      return { kind: 'activation-failed', error: message }
    }
  }

  return { kind: 'ready', extension: ext }
}
