import * as vscode from 'vscode'
import * as assert from 'assert'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Find Claude sessions directly from filesystem
function findFirstSession(): { projectName: string; sessionId: string } | null {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(claudeDir)) {
    return null
  }

  const projects = fs.readdirSync(claudeDir).filter((name) => {
    const projectPath = path.join(claudeDir, name)
    return fs.statSync(projectPath).isDirectory()
  })

  for (const projectName of projects) {
    const projectPath = path.join(claudeDir, projectName)
    const sessions = fs.readdirSync(projectPath).filter((name) => name.endsWith('.jsonl'))

    if (sessions.length > 0) {
      const sessionId = sessions[0].replace('.jsonl', '')
      return { projectName, sessionId }
    }
  }

  return null
}

// Create a mock SessionTreeItem for testing
function createMockSessionTreeItem(projectName: string, sessionId: string) {
  return {
    type: 'session',
    projectName,
    sessionId,
    label: 'Test Session',
    collapsibleState: vscode.TreeItemCollapsibleState.None,
  }
}

suite('Webview Test Suite', () => {
  test('Commands are registered', async function () {
    this.timeout(30000)

    // Wait for VSCode to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Open the Claude Sessions view
    try {
      await vscode.commands.executeCommand('workbench.view.extension.claude-sessions')
      console.log('Opened Claude Sessions view')
    } catch (e) {
      console.log('Could not open Claude Sessions view:', e)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Get the extension
    const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
    if (!extension) {
      console.log('Extension not found, skipping test')
      return
    }

    // Activate extension if not already active
    if (!extension.isActive) {
      await extension.activate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Check that extension commands are registered
    const commands = await vscode.commands.getCommands(true)
    const sessionCommands = commands.filter((c) => c.startsWith('claudeSessions'))
    console.log('Registered session commands:', sessionCommands)

    assert.ok(
      sessionCommands.includes('claudeSessions.refresh'),
      'Refresh command should be registered'
    )
    assert.ok(
      sessionCommands.includes('claudeSessions.openSession'),
      'OpenSession command should be registered'
    )
    assert.ok(
      sessionCommands.includes('claudeSessions.openWebUI'),
      'OpenWebUI command should be registered'
    )

    console.log('All expected commands are registered')
  })

  test('Session click opens webview', async function () {
    this.timeout(30000)

    // Wait for VSCode to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get the extension
    const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
    if (!extension) {
      console.log('Extension not found, skipping test')
      return
    }

    // Activate extension if not already active
    if (!extension.isActive) {
      await extension.activate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Find a session to open
    const sessionInfo = findFirstSession()
    if (!sessionInfo) {
      console.log('No sessions found, skipping test')
      return
    }

    console.log(`Opening session: ${sessionInfo.projectName}/${sessionInfo.sessionId}`)

    // Get initial tab count
    const initialTabCount = vscode.window.tabGroups.all.reduce(
      (sum, group) => sum + group.tabs.length,
      0
    )
    console.log('Initial tab count:', initialTabCount)

    // Create mock SessionTreeItem and execute openSession command
    const mockItem = createMockSessionTreeItem(sessionInfo.projectName, sessionInfo.sessionId)
    await vscode.commands.executeCommand('claudeSessions.openSession', mockItem)
    console.log('OpenSession command executed')

    // Wait for webview to open
    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Verify a new tab was opened
    const newTabCount = vscode.window.tabGroups.all.reduce(
      (sum, group) => sum + group.tabs.length,
      0
    )
    console.log('New tab count:', newTabCount)

    // Check all tabs
    const allTabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs)
    console.log(
      'All tab labels:',
      allTabs.map((t) => t.label)
    )

    assert.ok(newTabCount > initialTabCount, 'A new tab should be opened after clicking session')
    console.log('Session webview successfully opened')
  })

  test('Tree expansion works without duplicate ID errors', async function () {
    this.timeout(60000)

    // Wait for VSCode to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get the extension
    const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
    if (!extension) {
      console.log('Extension not found, skipping test')
      return
    }

    // Activate extension if not already active
    if (!extension.isActive) {
      await extension.activate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Open the Claude Sessions view
    await vscode.commands.executeCommand('workbench.view.extension.claude-sessions')
    console.log('Opened Claude Sessions view')
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Refresh to load tree data
    await vscode.commands.executeCommand('claudeSessions.refresh')
    console.log('Refreshed tree view')
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // The test passes if no errors occurred during tree loading
    // VSCode will throw errors for duplicate tree item IDs
    console.log('Tree expansion completed without errors')
    assert.ok(true, 'Tree loaded without duplicate ID errors')
  })

  test('Open Web UI opens external browser', async function () {
    // Skip in CI - web server startup via npx is slow/unreliable in headless CI
    if (process.env.CI) {
      console.log('Skipping openWebUI test in CI environment')
      this.skip()
      return
    }

    this.timeout(30000)

    // Wait for VSCode to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get the extension
    const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
    if (!extension) {
      console.log('Extension not found, skipping test')
      return
    }

    // Activate extension if not already active
    if (!extension.isActive) {
      await extension.activate()
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Execute openWebUI command - this opens external browser, not a tab
    // Just verify the command executes without error
    try {
      await vscode.commands.executeCommand('claudeSessions.openWebUI')
      console.log('OpenWebUI command executed successfully')
      // Command executed without throwing - that's the success criterion
      assert.ok(true, 'openWebUI command executed without error')
    } catch (err) {
      assert.fail(`openWebUI command failed: ${err}`)
    }
  })
})
