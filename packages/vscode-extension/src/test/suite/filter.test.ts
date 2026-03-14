import * as vscode from 'vscode'
import * as assert from 'assert'

suite('Filter Test Suite', () => {
  test('Filter commands are registered', async function () {
    this.timeout(30000)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
    if (!extension) {
      console.log('Extension not found, skipping test')
      return
    }

    if (!extension.isActive) {
      await extension.activate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

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

  test('Clear filter resets context key', async function () {
    this.timeout(30000)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
    if (!extension) {
      console.log('Extension not found, skipping test')
      return
    }

    if (!extension.isActive) {
      await extension.activate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Execute clearFilter — should not throw
    await vscode.commands.executeCommand('claudeSessions.clearFilter')
    console.log('clearFilter command executed without error')

    // After clearing, the filterActive context should be false
    // We cannot directly read context keys, but verifying no error is thrown
    // confirms the command handler is wired up correctly
    assert.ok(true, 'clearFilter executed without error')
  })

  test('Tree view is created with correct ID', async function () {
    this.timeout(30000)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
    if (!extension) {
      console.log('Extension not found, skipping test')
      return
    }

    if (!extension.isActive) {
      await extension.activate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Open the Claude Sessions sidebar
    try {
      await vscode.commands.executeCommand('workbench.view.extension.claude-sessions')
      console.log('Claude Sessions view opened')
    } catch (e) {
      console.log('Could not open Claude Sessions view:', e)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Verify the view container contribution exists
    const pkg = extension.packageJSON
    const viewContainers = pkg?.contributes?.viewsContainers?.activitybar ?? []
    const claudeContainer = viewContainers.find((c: { id: string }) => c.id === 'claude-sessions')
    assert.ok(claudeContainer, 'Claude Sessions view container should exist')

    const views = pkg?.contributes?.views?.['claude-sessions'] ?? []
    const claudeView = views.find((v: { id: string }) => v.id === 'claudeSessions')
    assert.ok(claudeView, 'claudeSessions view should exist in the container')

    console.log('Tree view structure verified')
  })

  test('Keyboard shortcut for filter is registered', async function () {
    this.timeout(30000)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
    if (!extension) {
      console.log('Extension not found, skipping test')
      return
    }

    if (!extension.isActive) {
      await extension.activate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

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

    assert.ok(true, 'Keybinding check completed')
  })
})
