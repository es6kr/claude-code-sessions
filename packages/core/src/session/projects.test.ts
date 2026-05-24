import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  const readdirMock = vi.fn(actual.readdir)
  return {
    ...actual,
    readdir: readdirMock,
    default: { ...actual, readdir: readdirMock },
  }
})

vi.mock('../paths.js', async () => {
  const actual = await vi.importActual<typeof import('../paths.js')>('../paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { listProjects } from './projects.js'
import { getSessionsDir } from '../paths.js'

function writeSession(dir: string, projectName: string, sessionId: string) {
  const content =
    JSON.stringify({
      type: 'user',
      uuid: `msg-${sessionId}`,
      timestamp: new Date().toISOString(),
      message: { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
    }) + '\n'
  return fs.writeFile(path.join(dir, projectName, `${sessionId}.jsonl`), content, 'utf-8')
}

describe('listProjects', () => {
  let tempDir: string

  beforeEach(async () => {
    // Restore readdir to the real implementation; individual tests may override.
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fs.readdir).mockImplementation(actual.readdir as typeof fs.readdir)

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'projects-test-'))
    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  // Issue #103 — Guard per-entry readdir against missing folders (TOCTOU).
  describe('readdir TOCTOU safety (Issue #103)', () => {
    function makeEnoent(p: string): NodeJS.ErrnoException {
      const err = new Error(
        `ENOENT: no such file or directory, scandir '${p}'`
      ) as NodeJS.ErrnoException
      err.code = 'ENOENT'
      return err
    }

    it('T4: listProjects skips an entry whose folder vanishes between top-level readdir and per-entry readdir', async () => {
      const projGone = '-Users-test-listprojects-gone'
      const projKeep = '-Users-test-listprojects-keep'
      await fs.mkdir(path.join(tempDir, projGone), { recursive: true })
      await fs.mkdir(path.join(tempDir, projKeep), { recursive: true })
      await writeSession(tempDir, projGone, 'g1')
      await writeSession(tempDir, projKeep, 'k1')

      // Top-level readdir(sessionsDir) succeeds and reports both entries.
      // Per-entry readdir(projGone) fails as if the folder vanished mid-iteration.
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projGone)) {
          return Promise.reject(makeEnoent(p))
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // After fix: vanished entry filtered out, other entries returned normally.
      const projects = await Effect.runPromise(listProjects)
      expect(projects.map((p) => p.name)).toContain(projKeep)
      expect(projects.map((p) => p.name)).not.toContain(projGone)
    })

    it('T5: listProjects returns other valid projects when one entry readdir fails', async () => {
      const projFail = '-Users-test-listprojects-fail'
      const projOk1 = '-Users-test-listprojects-ok1'
      const projOk2 = '-Users-test-listprojects-ok2'
      await fs.mkdir(path.join(tempDir, projFail), { recursive: true })
      await fs.mkdir(path.join(tempDir, projOk1), { recursive: true })
      await fs.mkdir(path.join(tempDir, projOk2), { recursive: true })
      await writeSession(tempDir, projFail, 'f1')
      await writeSession(tempDir, projOk1, 'a1')
      await writeSession(tempDir, projOk2, 'b1')

      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projFail)) {
          return Promise.reject(makeEnoent(p))
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // After fix: 2 healthy projects returned, failing entry filtered.
      const projects = await Effect.runPromise(listProjects)
      const names = projects.map((p) => p.name).sort()
      expect(names).toEqual([projOk1, projOk2].sort())
    })

    it('T7: non-ENOENT readdir error (EACCES) PROPAGATES (does not silently skip)', async () => {
      const projDenied = '-Users-test-listprojects-eacces'
      const projOk = '-Users-test-listprojects-ok-eacces'
      await fs.mkdir(path.join(tempDir, projDenied), { recursive: true })
      await fs.mkdir(path.join(tempDir, projOk), { recursive: true })
      await writeSession(tempDir, projDenied, 'd1')
      await writeSession(tempDir, projOk, 'o1')

      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      vi.mocked(fs.readdir).mockImplementation(((p: unknown, opts: unknown) => {
        if (typeof p === 'string' && p.endsWith(projDenied)) {
          const err = new Error(
            `EACCES: permission denied, scandir '${p}'`
          ) as NodeJS.ErrnoException
          err.code = 'EACCES'
          return Promise.reject(err)
        }
        return (actual.readdir as typeof fs.readdir)(
          p as Parameters<typeof fs.readdir>[0],
          opts as Parameters<typeof fs.readdir>[1]
        )
      }) as typeof fs.readdir)

      // After narrow-catch fix: EACCES is NOT swallowed → listProjects fails loudly
      await expect(Effect.runPromise(listProjects)).rejects.toThrow()
    })
  })
})
