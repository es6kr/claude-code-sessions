import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import * as os from 'os'

// Core is ESM — use dynamic import
async function importCore() {
  return await import('@claude-sessions/core')
}

suite('Path Handling Test Suite', () => {
  test('openProjectFolder command is registered', async function () {
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
      commands.includes('claudeSessions.openProjectFolder'),
      'openProjectFolder command should be registered'
    )
    assert.ok(
      commands.includes('claudeSessions.openSessionsFolder'),
      'openSessionsFolder command should be registered'
    )
    assert.ok(
      commands.includes('claudeSessions.resumeSession'),
      'resumeSession command should be registered'
    )

    console.log('All path-related commands are registered')
  })

  test('folderNameToPath produces valid paths', async function () {
    this.timeout(30000)

    const session = await importCore()
    const { Effect } = await import('effect')
    const projects = await Effect.runPromise(session.listProjects)

    if (projects.length === 0) {
      console.log('No projects found, skipping path validation')
      return
    }

    // Test a subset of projects
    const testProjects = projects.slice(0, 5)

    for (const project of testProjects) {
      const folderPath = await session.folderNameToPath(project.name)
      console.log(`Project "${project.name}" -> path "${folderPath}"`)

      // Path should not contain mixed separators (Windows issue from PR #16)
      if (process.platform === 'win32') {
        const hasForwardSlash = folderPath.includes('/')
        const hasBackSlash = folderPath.includes('\\')
        if (hasForwardSlash && hasBackSlash) {
          assert.fail(`Mixed path separators detected: "${folderPath}" — this was fixed in PR #16`)
        }
      }

      // Path should start with a separator or drive letter
      const isAbsolute =
        folderPath.startsWith('/') || folderPath.startsWith('~') || /^[A-Za-z]:/.test(folderPath)
      assert.ok(isAbsolute, `Path should be absolute or home-relative: "${folderPath}"`)
    }

    console.log(`Validated ${testProjects.length} project paths`)
  })

  test('expandHomePath resolves correctly', async function () {
    this.timeout(10000)

    const session = await importCore()
    const homeDir = os.homedir()

    // Test tilde expansion
    const tildeInput = '~/projects/test'
    const expanded = session.expandHomePath(tildeInput, homeDir)
    assert.ok(
      expanded.startsWith(homeDir),
      `Expanded path should start with home directory: "${expanded}"`
    )
    assert.ok(!expanded.includes('~'), `Expanded path should not contain tilde: "${expanded}"`)

    // Test already-absolute path
    const absoluteInput = path.join(homeDir, 'projects', 'test')
    const expandedAbsolute = session.expandHomePath(absoluteInput, homeDir)
    assert.strictEqual(
      expandedAbsolute,
      absoluteInput,
      'Absolute path should be returned unchanged'
    )

    // Test platform-specific path consistency
    if (process.platform === 'win32') {
      const winPath = session.expandHomePath('~/test', homeDir)
      assert.ok(
        !winPath.includes('/'),
        `Windows path should not contain forward slashes: "${winPath}"`
      )
    }

    console.log('expandHomePath tests passed')
  })

  test('getSessionsDir returns valid path', async function () {
    this.timeout(10000)

    const session = await importCore()
    const sessionsDir = session.getSessionsDir()
    console.log('Sessions directory:', sessionsDir)

    // Should be an absolute path
    assert.ok(path.isAbsolute(sessionsDir), `Sessions dir should be absolute: "${sessionsDir}"`)

    // Should contain 'claude' in the path (platform-agnostic check)
    const lowerPath = sessionsDir.toLowerCase()
    assert.ok(
      lowerPath.includes('claude'),
      `Sessions dir should reference claude: "${sessionsDir}"`
    )

    // Should not have mixed separators on Windows
    if (process.platform === 'win32') {
      const hasForward = sessionsDir.includes('/')
      const hasBack = sessionsDir.includes('\\')
      if (hasForward && hasBack) {
        assert.fail(`Mixed separators in sessions dir: "${sessionsDir}"`)
      }
    }

    console.log('getSessionsDir validation passed')
  })
})
