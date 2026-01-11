import * as path from 'path'
import * as os from 'os'
import { runTests } from '@vscode/test-electron'

async function main() {
  // Unset ELECTRON_RUN_AS_NODE to ensure Electron runs as Electron, not Node
  delete process.env.ELECTRON_RUN_AS_NODE

  const extensionDevelopmentPath = path.resolve(__dirname, '../../')
  const extensionTestsPath = path.resolve(__dirname, './suite/index')

  // Use short temp path for user data to avoid IPC path length issues
  const userDataDir = path.join(os.tmpdir(), 'vscode-test-sessions')

  console.log('Extension path:', extensionDevelopmentPath)
  console.log('Tests path:', extensionTestsPath)
  console.log('User data dir:', userDataDir)

  try {
    const exitCode = await runTests({
      version: '1.85.0',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: ['--disable-gpu', `--user-data-dir=${userDataDir}`],
    })
    console.log('Tests finished with exit code:', exitCode)
    process.exit(exitCode)
  } catch (err) {
    console.error('Failed to run tests:', err)
    process.exit(1)
  }
}

main()
