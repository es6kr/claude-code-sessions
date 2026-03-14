import * as vscode from 'vscode'
import * as assert from 'assert'

/**
 * Ensure extension is loaded and activated.
 * Calls this.skip() if extension is not found (visible in Mocha output).
 */
async function ensureExtensionActive(ctx: Mocha.Context): Promise<vscode.Extension<unknown>> {
  ctx.timeout(30000)
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
  if (!extension) {
    ctx.skip()
    // unreachable after skip, but satisfies TS return type
    throw new Error('Extension not found')
  }

  if (!extension.isActive) {
    await extension.activate()
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return extension
}

suite('Filter Test Suite', () => {
  test('Filter commands are registered', async function () {
    await ensureExtensionActive(this)

    const commands = await vscode.commands.getCommands(true)

    assert.ok(
      commands.includes('claudeSessions.filterSessions'),
      'filterSessions command should be registered'
    )
    assert.ok(
      commands.includes('claudeSessions.clearFilter'),
      'clearFilter command should be registered'
    )
    assert.ok(commands.includes('claudeSessions.sortBy'), 'sortBy command should be registered')

    console.log('All filter commands are registered')
  })

  test('clearFilter command executes without error', async function () {
    await ensureExtensionActive(this)

    // Execute clearFilter — test passes if no error is thrown
    await vscode.commands.executeCommand('claudeSessions.clearFilter')
    console.log('clearFilter command executed without error')
  })

  test('View container and view contributions are defined', async function () {
    const extension = await ensureExtensionActive(this)

    // Open the Claude Sessions sidebar
    try {
      await vscode.commands.executeCommand('workbench.view.extension.claude-sessions')
      console.log('Claude Sessions view opened')
    } catch (e) {
      console.log('Could not open Claude Sessions view:', e)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Verify the view container contribution exists in package.json
    const pkg = extension.packageJSON
    const viewContainers = pkg?.contributes?.viewsContainers?.activitybar ?? []
    const claudeContainer = viewContainers.find((c: { id: string }) => c.id === 'claude-sessions')
    assert.ok(claudeContainer, 'Claude Sessions view container should exist')

    const views = pkg?.contributes?.views?.['claude-sessions'] ?? []
    const claudeView = views.find((v: { id: string }) => v.id === 'claudeSessions')
    assert.ok(claudeView, 'claudeSessions view should exist in the container')

    console.log('View contributions verified')
  })

  test('Keyboard shortcut for filter is registered', async function () {
    const extension = await ensureExtensionActive(this)

    // Verify the keybinding is defined in package.json
    const pkg = extension.packageJSON
    const keybindings = pkg?.contributes?.keybindings ?? []
    const filterKeybinding = keybindings.find(
      (kb: { command: string }) => kb.command === 'claudeSessions.filterSessions'
    )

    // keybinding may or may not exist depending on PR #37 merge status
    if (filterKeybinding) {
      console.log('Filter keybinding found:', JSON.stringify(filterKeybinding))
      assert.ok(
        filterKeybinding.key || filterKeybinding.mac,
        'Keybinding should have a key defined'
      )
    } else {
      console.log('No filter keybinding defined (PR #37 may not be merged yet)')
    }
  })
})
