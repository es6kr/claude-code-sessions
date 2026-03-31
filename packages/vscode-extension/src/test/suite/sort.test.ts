import * as assert from 'assert'
import { ensureExtensionActive } from './helpers'

// Core is ESM — use dynamic import
async function importCore() {
  return await import('@claude-sessions/core')
}

/**
 * Find a project with enough sessions to test sorting.
 */
async function findTestProject(minSessions = 3) {
  const session = await importCore()
  const { Effect } = await import('effect')
  const projects = await Effect.runPromise(session.listProjects)
  for (const p of projects) {
    if (p.sessionCount >= minSessions) {
      return p.name
    }
  }
  return null
}

suite('Sort Timestamp E2E', () => {
  test('sortTimestamp matches updatedAt when sorted by updated', async function () {
    await ensureExtensionActive(this)
    this.timeout(30000)

    const projectName = await findTestProject()
    if (!projectName) {
      console.log('No project with enough sessions, skipping')
      this.skip()
      return
    }

    const session = await importCore()
    const { Effect } = await import('effect')
    const data = await Effect.runPromise(
      session.loadProjectTreeData(projectName, { field: 'updated', order: 'desc' })
    )
    assert.ok(data, 'Project data should load')
    assert.ok(data.sessions.length >= 3, `Need >= 3 sessions, got ${data.sessions.length}`)

    for (const s of data.sessions) {
      if (s.updatedAt) {
        const expected = new Date(s.updatedAt).getTime()
        assert.strictEqual(
          s.sortTimestamp,
          expected,
          `Session ${s.id.slice(0, 8)}: sortTimestamp (${new Date(s.sortTimestamp).toISOString()}) should match updatedAt (${s.updatedAt})`
        )
      }
    }
    console.log(`Verified ${data.sessions.length} sessions: sortTimestamp === updatedAt`)
  })

  test('sortTimestamp matches createdAt when sorted by created', async function () {
    await ensureExtensionActive(this)
    this.timeout(30000)

    const projectName = await findTestProject()
    if (!projectName) {
      this.skip()
      return
    }

    const session = await importCore()
    const { Effect } = await import('effect')
    const data = await Effect.runPromise(
      session.loadProjectTreeData(projectName, { field: 'created', order: 'desc' })
    )
    assert.ok(data, 'Project data should load')

    for (const s of data.sessions) {
      if (s.createdAt) {
        const expected = new Date(s.createdAt).getTime()
        assert.strictEqual(
          s.sortTimestamp,
          expected,
          `Session ${s.id.slice(0, 8)}: sortTimestamp should match createdAt`
        )
      }
    }
    console.log(`Verified ${data.sessions.length} sessions: sortTimestamp === createdAt`)
  })

  test('sort order is monotonically decreasing for desc', async function () {
    await ensureExtensionActive(this)
    this.timeout(30000)

    const projectName = await findTestProject()
    if (!projectName) {
      this.skip()
      return
    }

    const session = await importCore()
    const { Effect } = await import('effect')
    const data = await Effect.runPromise(
      session.loadProjectTreeData(projectName, { field: 'updated', order: 'desc' })
    )
    assert.ok(data, 'Project data should load')

    for (let i = 0; i < data.sessions.length - 1; i++) {
      const current = data.sessions[i]
      const next = data.sessions[i + 1]
      assert.ok(
        current.sortTimestamp >= next.sortTimestamp,
        `Session ${i} (${new Date(current.sortTimestamp).toISOString()}) should be >= session ${i + 1} (${new Date(next.sortTimestamp).toISOString()})`
      )
    }
    console.log(`Verified desc order for ${data.sessions.length} sessions`)
  })
})
