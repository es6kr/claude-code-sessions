import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { Effect } from 'effect'

// Mock the paths module to use temp directory
vi.mock('../paths.js', async () => {
  const actual = await vi.importActual('../paths.js')
  return {
    ...actual,
    getSessionsDir: vi.fn(),
  }
})

import { searchBySessionId, searchSessions } from '../session/search.js'
import { getSessionsDir } from '../paths.js'

describe('searchBySessionId', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-search-test-'))

    // Create two projects with sessions
    const project1Dir = path.join(tempDir, '-Users-test-project')
    const project2Dir = path.join(tempDir, '-Users-test-other')
    await fs.mkdir(project1Dir, { recursive: true })
    await fs.mkdir(project2Dir, { recursive: true })

    // Project 1: two sessions
    await fs.writeFile(
      path.join(project1Dir, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl'),
      '{"type":"user","uuid":"msg-1","message":{"role":"user","content":"Hello world"},"timestamp":"2026-04-20T10:00:00Z"}\n'
    )
    await fs.writeFile(
      path.join(project1Dir, 'a1b2c3d4-ffff-0000-1111-222233334444.jsonl'),
      '{"type":"user","uuid":"msg-2","message":{"role":"user","content":"Second session"},"timestamp":"2026-04-21T10:00:00Z"}\n'
    )
    // Agent file (should be excluded)
    await fs.writeFile(path.join(project1Dir, 'agent-task.jsonl'), '{"type":"user"}\n')

    // Project 2: one session with overlapping prefix
    await fs.writeFile(
      path.join(project2Dir, 'a1b2c3d4-9999-8888-7777-666655554444.jsonl'),
      '{"type":"user","uuid":"msg-3","message":{"role":"user","content":"Cross-project session"},"timestamp":"2026-04-22T10:00:00Z"}\n'
    )

    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('should find session by exact ID', async () => {
    const results = await Effect.runPromise(
      searchBySessionId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    )
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    expect(results[0].matchType).toBe('sessionId')
  })

  it('should find sessions by partial ID prefix', async () => {
    const results = await Effect.runPromise(searchBySessionId('a1b2c3d4'))
    // Should match all 3 sessions across both projects
    expect(results).toHaveLength(3)
    expect(results.every((r) => r.matchType === 'sessionId')).toBe(true)
  })

  it('should return empty array for non-existent ID', async () => {
    const results = await Effect.runPromise(searchBySessionId('deadbeef-0000'))
    expect(results).toEqual([])
  })

  it('should filter by project when projectName is specified', async () => {
    const results = await Effect.runPromise(
      searchBySessionId('a1b2c3d4', { projectName: '-Users-test-project' })
    )
    expect(results).toHaveLength(2)
    expect(results.every((r) => r.projectName === '-Users-test-project')).toBe(true)
  })

  it('should sort results by timestamp (newest first)', async () => {
    const results = await Effect.runPromise(searchBySessionId('a1b2c3d4'))
    expect(results).toHaveLength(3)
    // project2 session is newest (2026-04-22)
    expect(results[0].projectName).toBe('-Users-test-other')
  })

  it('should include title from first user message', async () => {
    const results = await Effect.runPromise(
      searchBySessionId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    )
    expect(results[0].title).toBeTruthy()
  })

  it('should exclude agent files', async () => {
    const results = await Effect.runPromise(searchBySessionId('agent-task'))
    expect(results).toEqual([])
  })
})

describe('searchSessions - session ID detection', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-search-detect-'))
    const projectDir = path.join(tempDir, '-Users-test-detect')
    await fs.mkdir(projectDir, { recursive: true })

    await fs.writeFile(
      path.join(projectDir, 'abcdef12-3456-7890-abcd-ef1234567890.jsonl'),
      '{"type":"user","uuid":"msg-1","message":{"role":"user","content":"Detectable session"},"timestamp":"2026-04-20T10:00:00Z"}\n'
    )

    vi.mocked(getSessionsDir).mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('should detect hex-pattern queries and return sessionId matchType', async () => {
    const results = await Effect.runPromise(searchSessions('abcdef12'))
    const idMatch = results.find((r) => r.matchType === 'sessionId')
    expect(idMatch).toBeDefined()
    expect(idMatch!.sessionId).toBe('abcdef12-3456-7890-abcd-ef1234567890')
  })

  it('should fall through to title search when no ID matches', async () => {
    const results = await Effect.runPromise(searchSessions('deadbeef99'))
    // No sessionId matches, title search runs (may be empty)
    expect(Array.isArray(results)).toBe(true)
    expect(results.every((r) => r.matchType !== 'sessionId')).toBe(true)
  })

  it('should not trigger ID search for non-hex queries', async () => {
    // "hello world" does not match SESSION_ID_PATTERN
    const results = await Effect.runPromise(searchSessions('hello world'))
    expect(results.every((r) => r.matchType !== 'sessionId')).toBe(true)
  })

  it('should not trigger ID search for short queries', async () => {
    // "abc" is too short (< 8 chars)
    const results = await Effect.runPromise(searchSessions('abc'))
    // Should only have title/content matches, not sessionId
    expect(results.every((r) => r.matchType !== 'sessionId')).toBe(true)
  })
})
