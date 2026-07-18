import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = '-Users-test-project'
const SESSION = 'session-capability-matrix'
const FIXTURE_PATH = path.resolve(
  __dirname,
  `../../test-fixtures/sessions/${PROJECT}/${SESSION}.jsonl`
)

// Fixture: text + paired tool_use/tool_result + thinking-only + trailing text.
// Exercises the issue #123 Scope (b) capability matrix end-to-end:
// tool_result and thinking messages must expose an edit affordance whose save
// path preserves structured fields (tool_use_id / is_error / signature), while
// tool_use messages must never be editable (pairing invariant).
const ORIGINAL_FIXTURE =
  [
    '{"type":"user","uuid":"cap-msg-1","sessionId":"session-capability-matrix","timestamp":"2025-12-23T05:00:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Run the listing"}]}}',
    '{"type":"assistant","uuid":"cap-msg-2","parentUuid":"cap-msg-1","sessionId":"session-capability-matrix","timestamp":"2025-12-23T05:00:10.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_cap1","name":"Bash","input":{"command":"ls"}}]}}',
    '{"type":"user","uuid":"cap-msg-3","parentUuid":"cap-msg-2","sessionId":"session-capability-matrix","timestamp":"2025-12-23T05:00:11.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_cap1","content":"original tool output","is_error":false}]}}',
    '{"type":"assistant","uuid":"cap-msg-4","parentUuid":"cap-msg-3","sessionId":"session-capability-matrix","timestamp":"2025-12-23T05:00:20.000Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"original reasoning","signature":"sig-cap"}]}}',
    '{"type":"assistant","uuid":"cap-msg-5","parentUuid":"cap-msg-4","sessionId":"session-capability-matrix","timestamp":"2025-12-23T05:00:30.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Done listing."}]}}',
  ].join('\n') + '\n'

const readFixtureLines = (): Array<Record<string, unknown>> =>
  fs
    .readFileSync(FIXTURE_PATH, 'utf-8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>)

const contentOf = (line: Record<string, unknown>): Array<Record<string, unknown>> =>
  ((line.message as Record<string, unknown>).content ?? []) as Array<Record<string, unknown>>

const editMessage = async (
  page: import('@playwright/test').Page,
  msgId: string,
  newText: string
) => {
  const container = page.locator(`[data-msg-id="${msgId}"]`)
  await container.hover()
  await container.locator('button', { hasText: '📝' }).click()
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible()
  const textarea = dialog.locator('textarea').first()
  await textarea.fill(newText)
  await dialog.locator('button', { hasText: 'Save' }).click()
  await expect(dialog).not.toBeVisible()
}

test.describe('Message capabilities (issue #123 Scope (b))', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    fs.writeFileSync(FIXTURE_PATH, ORIGINAL_FIXTURE)
    await page.goto(`/session/${PROJECT}/${SESSION}`)
    await page.waitForSelector('button:has-text("Messages")', { timeout: 10000 })
    // tool_result / thinking / tool_use categories are hidden by default
    await page.locator('button', { hasText: 'All' }).first().click()
    await expect(page.locator('[data-msg-id="cap-msg-3"]')).toBeVisible()
  })

  test.afterAll(() => {
    fs.writeFileSync(FIXTURE_PATH, ORIGINAL_FIXTURE)
  })

  test('tool_result message exposes edit and preserves tool_use_id/is_error on save', async ({
    page,
  }) => {
    await editMessage(page, 'cap-msg-3', 'corrected tool output')

    await expect
      .poll(() => contentOf(readFixtureLines()[2])[0], { timeout: 5000 })
      .toEqual({
        type: 'tool_result',
        tool_use_id: 'toolu_cap1',
        content: 'corrected tool output',
        is_error: false,
      })
  })

  test('thinking message exposes edit and preserves signature on save', async ({ page }) => {
    await editMessage(page, 'cap-msg-4', 'revised reasoning')

    await expect
      .poll(() => contentOf(readFixtureLines()[3])[0], { timeout: 5000 })
      .toEqual({
        type: 'thinking',
        thinking: 'revised reasoning',
        signature: 'sig-cap',
      })
  })

  test('tool_use message never shows an edit affordance (pairing invariant)', async ({ page }) => {
    const container = page.locator('[data-msg-id="cap-msg-2"]')
    await container.hover()
    await expect(container.locator('button', { hasText: '📝' })).toHaveCount(0)
    // delete affordance stays available (behavior-preserving)
    await expect(container.locator('button', { hasText: '🗑️' })).toHaveCount(1)
  })

  test('text message editing still works (regression)', async ({ page }) => {
    await editMessage(page, 'cap-msg-5', 'Done listing files.')

    await expect
      .poll(() => contentOf(readFixtureLines()[4])[0], { timeout: 5000 })
      .toEqual({ type: 'text', text: 'Done listing files.' })
  })
})
