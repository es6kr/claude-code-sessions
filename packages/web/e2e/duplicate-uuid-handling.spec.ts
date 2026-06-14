import { test, expect } from '@playwright/test'

// Regression: Issue #137 — duplicate uuid records in JSONL must not crash the
// MessageList with Svelte's each_key_duplicate runtime error. The fix in
// MessageList.svelte derives per-row keys via $derived.by + Set so the first
// occurrence of each uuid keeps the bare uuid (stable Svelte identity) while
// subsequent occurrences get an index suffix to guarantee uniqueness.

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
    // Settle on networkidle rather than a specific selector — without the fix,
    // hydration crashes mid-mount and the Messages button is never rendered.
    // We assert on the *error signal* directly, not the absence of a button.
    await page.waitForLoadState('networkidle')

    const duplicateKeyErrors = errors.filter((m) => m.includes('each_key_duplicate'))
    expect(
      duplicateKeyErrors,
      `Expected no each_key_duplicate errors, got:\n${duplicateKeyErrors.join('\n')}`
    ).toHaveLength(0)

    // Secondary: with the fix, the messages render and the Messages tab button
    // (with the per-fixture message count) becomes visible. Use a regex-bound
    // role matcher to avoid strict-mode violation against the Navigation-mode
    // button that also contains the word "Messages".
    await expect(page.getByRole('button', { name: /💬 Messages \(\d+\)/ })).toBeVisible({
      timeout: 5000,
    })
  })
})
