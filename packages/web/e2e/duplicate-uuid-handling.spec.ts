import { test, expect } from '@playwright/test'

// Regression: Issue #137 — duplicate uuid records in JSONL must not crash the
// MessageList with Svelte's each_key_duplicate runtime error. The fix in
// MessageList.svelte appends the array index to the uuid so the {#each} block
// key remains unique even when underlying records share the same uuid (sync
// conflicts, repeated history appends, cross-session edits).

const PROJECT = '-Users-test-duplicate-uuid'
const SESSION = 'session-dup-uuid'

test.describe('Issue #137 — duplicate uuid handling', () => {
  test('does not throw each_key_duplicate when records share uuids', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto(`/session/${PROJECT}/${SESSION}`)
    await page.waitForSelector('button:has-text("Messages")', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    const duplicateKeyErrors = errors.filter((m) => m.includes('each_key_duplicate'))
    expect(
      duplicateKeyErrors,
      `Expected no each_key_duplicate errors, got: ${duplicateKeyErrors.join('\n')}`
    ).toHaveLength(0)
  })
})
