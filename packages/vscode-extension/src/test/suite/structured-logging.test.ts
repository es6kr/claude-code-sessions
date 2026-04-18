import * as assert from 'assert'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

async function importCore() {
  return await import('@claude-sessions/core')
}

suite.skip('Structured logging for unreadable files — WIP', () => {
  let tmpDir: string
  let debugMessages: string[]
  let originalLogger: ReturnType<Awaited<ReturnType<typeof importCore>>['getLogger']>

  suiteSetup(async function () {
    this.timeout(10000)
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'logging-test-'))
    const core = await importCore()
    originalLogger = core.getLogger()
  })

  setup(async () => {
    debugMessages = []
    const core = await importCore()
    core.setLogger({
      debug: (msg: string) => debugMessages.push(msg),
      info: () => {},
      warn: () => {},
      error: () => {},
    })
  })

  teardown(async () => {
    const core = await importCore()
    core.setLogger(originalLogger)
  })

  suiteTeardown(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test('debug log emitted when session file is unreadable', async function () {
    this.timeout(10000)
    const { Effect } = await import('effect')
    const core = await importCore()

    const projectDir = path.join(tmpDir, 'test-project')
    await fs.mkdir(projectDir, { recursive: true })

    const sessionFile = path.join(projectDir, 'unreadable-session.jsonl')
    await fs.writeFile(sessionFile, '{"type":"human","message":{"content":"test"}}')
    await fs.chmod(sessionFile, 0o000)

    try {
      await Effect.runPromise(core.loadSessionTreeData('test-project', 'unreadable-session'))
    } catch {
      // Expected to fail — we only care about logging
    }

    const hasDebugLog = debugMessages.some(
      (msg) => msg.includes('unreadable') || msg.includes('Skipping')
    )
    assert.ok(
      hasDebugLog || process.platform === 'win32',
      `Expected debug log about unreadable file, got: ${JSON.stringify(debugMessages)}`
    )
  })
})
