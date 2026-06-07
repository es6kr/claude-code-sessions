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
