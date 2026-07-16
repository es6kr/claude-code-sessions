import * as vscode from 'vscode'
import * as assert from 'assert'
import { ensureExtensionActive } from './helpers'

// Regression guards for commands that have been silently lost in prior squash merges.
// Each declared command in package.json's contributes.commands MUST have a matching
// registerCommand call in extension.ts; otherwise the corresponding menu button
// (sidebar header, editor title, etc.) fails with "command not found" at click time.
suite('Command Registration Suite', () => {
  // GUARD: the official anthropic.claude-code extension does not watch session files
  // for changes and exposes no refresh/reload action. Users rely on this command
  // (surfaced via the Claude Sessions sidebar header $(debug-restart) button) to
  // pick up new sessions. It was lost once during an unrelated CI commit's squash
  // merge; this test prevents that recurrence.
  test('claudeSessions.restartExtensionHost command is registered', async function () {
    await ensureExtensionActive(this)
    const commands = await vscode.commands.getCommands(true)
    assert.ok(
      commands.includes('claudeSessions.restartExtensionHost'),
      'claudeSessions.restartExtensionHost must be registered — required for refreshing the session list because the official anthropic.claude-code extension does not detect file changes'
    )
  })

  test('claudeSessions.openPreview and openPreviewToSide are registered', async function () {
    await ensureExtensionActive(this)
    const commands = await vscode.commands.getCommands(true)
    assert.ok(
      commands.includes('claudeSessions.openPreview'),
      'claudeSessions.openPreview must be registered for the editor title preview action'
    )
    assert.ok(
      commands.includes('claudeSessions.openPreviewToSide'),
      'claudeSessions.openPreviewToSide must be registered for the editor title preview action'
    )
  })

  // GUARD: claudeSessions.resumeSession is the single entry point for resuming
  // sessions (3-way picker: internal terminal / external terminal / Claude Code
  // extension). Discussion #159 — M2 integrated picker. If this command is lost
  // in a squash merge, all three "open session" paths break with "command not
  // found" at click time.
  test('claudeSessions.resumeSession command is registered', async function () {
    await ensureExtensionActive(this)
    const commands = await vscode.commands.getCommands(true)
    assert.ok(
      commands.includes('claudeSessions.resumeSession'),
      'claudeSessions.resumeSession must be registered — the 3-way picker (internal/external/anthropic) for discussion #159 depends on it'
    )
  })
})

// Render-path guard for the resume-session Quick Pick (issue 173 finding 5).
// crossWorkspace.test.ts pins the pure decision function; these tests exercise
// the command end-to-end up to the rendered Quick Pick items by stubbing
// vscode.window.showQuickPick and invoking the real command with a fake tree
// item. The test host opens no workspace folder, so every session cwd is
// cross-workspace — which deterministically renders the 2-option pickers.
// The 3-option composition itself is pinned at the decision layer
// (pickerOptions/decideResume) plus the exhaustive MODE_TO_OPTION mapping in
// extension.ts; rendering it here would require the host to open a workspace
// folder whose path survives the disk-coupled projectName round-trip, which is
// not deterministic across CI platforms.
suite('Resume Session Quick Pick rendering', () => {
  type QuickPickFn = typeof vscode.window.showQuickPick
  let originalShowQuickPick: QuickPickFn
  let originalMode: unknown

  const fakeSessionItem = {
    type: 'session' as const,
    sessionId: 'test-session-id',
    projectName: '-nonexistent-csessions-render-test',
    label: 'render test session',
  }

  suiteSetup(async function () {
    await ensureExtensionActive(this)
    originalShowQuickPick = vscode.window.showQuickPick
    originalMode = vscode.workspace.getConfiguration('claudeSessions').get('defaultTerminalMode')
  })

  suiteTeardown(async () => {
    ;(vscode.window as { showQuickPick: QuickPickFn }).showQuickPick = originalShowQuickPick
    await vscode.workspace
      .getConfiguration('claudeSessions')
      .update('defaultTerminalMode', originalMode, vscode.ConfigurationTarget.Global)
  })

  const captureQuickPick = () => {
    const captured: { items: vscode.QuickPickItem[]; options?: vscode.QuickPickOptions }[] = []
    ;(vscode.window as { showQuickPick: QuickPickFn }).showQuickPick = (async (
      items: readonly vscode.QuickPickItem[] | Thenable<readonly vscode.QuickPickItem[]>,
      options?: vscode.QuickPickOptions
    ) => {
      captured.push({ items: [...(await items)], options })
      return undefined // user dismisses — command exits without dispatching
    }) as unknown as QuickPickFn
    return captured
  }

  test("defaultTerminalMode='ask' + cross-workspace renders the 2-option picker without the extension entry", async function () {
    this.timeout(30000)
    await vscode.workspace
      .getConfiguration('claudeSessions')
      .update('defaultTerminalMode', 'ask', vscode.ConfigurationTarget.Global)

    const captured = captureQuickPick()
    await vscode.commands.executeCommand('claudeSessions.resumeSession', fakeSessionItem)

    assert.strictEqual(captured.length, 1, 'resumeSession must render exactly one Quick Pick')
    const labels = captured[0].items.map((i) => i.label)
    assert.strictEqual(labels.length, 2, `expected 2 options, got: ${labels.join(' | ')}`)
    assert.ok(labels[0].includes('Internal Terminal'), 'first option must be Internal Terminal')
    assert.ok(labels[1].includes('External Terminal'), 'second option must be External Terminal')
    assert.ok(
      labels.every((l) => !l.includes('Claude Code Extension')),
      'cross-workspace picker must hide the Claude Code Extension entry'
    )
    assert.strictEqual(captured[0].options?.title, 'Resume Session')
  })

  test("defaultTerminalMode='anthropic' + cross-workspace renders the fallback picker", async function () {
    this.timeout(30000)
    await vscode.workspace
      .getConfiguration('claudeSessions')
      .update('defaultTerminalMode', 'anthropic', vscode.ConfigurationTarget.Global)

    const captured = captureQuickPick()
    await vscode.commands.executeCommand('claudeSessions.resumeSession', fakeSessionItem)

    assert.strictEqual(captured.length, 1, 'fallback path must render exactly one Quick Pick')
    assert.strictEqual(captured[0].items.length, 2, 'fallback picker offers the 2 terminal flavors')
    assert.strictEqual(captured[0].options?.title, 'Resume Session (fallback)')
  })
})
