import { test, expect } from '@playwright/test'

// Verifies the folder-grouped project tree view (Issue #152).
// Uses the same fixture data as other e2e specs via CLAUDE_SESSIONS_DIR.
test.describe('ProjectTree — folder-grouped view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('aside h2:has-text("Projects")')
    // Clear any persisted localStorage so each test starts from a known view mode.
    await page.evaluate(() => {
      localStorage.removeItem('claudeSessionsViewMode')
      localStorage.removeItem('claude-sessions.expandedGroups')
    })
    await page.reload()
    await page.waitForSelector('aside h2:has-text("Projects")')
    // Wait for SvelteKit to finish hydrating the page so the toggle button has
    // its click handler attached. waitForSelector matches SSR'd content which
    // exists before hydration; clicking too early would silently no-op on CI.
    await page.waitForLoadState('networkidle')
  })

  test('renders the view-mode toggle button', async ({ page }) => {
    const toggle = page.getByTestId('view-mode-toggle')
    await expect(toggle).toBeVisible()
    // Default view mode is folder-group.
    await expect(toggle).toHaveAttribute('data-view-mode', /folder-group|flat/)
  })

  test('cycles through view modes when toggle is clicked', async ({ page }) => {
    const toggle = page.getByTestId('view-mode-toggle')
    const initial = await toggle.getAttribute('data-view-mode')
    expect(initial).not.toBeNull()

    // Svelte 5 flushes reactive updates in a microtask after the click handler runs.
    // `toggle.click()` resolves before that microtask, so a plain sync `getAttribute`
    // read may observe the pre-update value. Use Playwright's auto-retrying
    // `toHaveAttribute` (or its negation) to wait for the attribute to settle.
    await toggle.click()
    await expect(toggle).not.toHaveAttribute('data-view-mode', initial!)
    const second = await toggle.getAttribute('data-view-mode')

    await toggle.click()
    await expect(toggle).not.toHaveAttribute('data-view-mode', second!)
    const third = await toggle.getAttribute('data-view-mode')

    // Cycle returns to original after three clicks (3-state toggle).
    await toggle.click()
    await expect(toggle).toHaveAttribute('data-view-mode', initial!)
    const fourth = await toggle.getAttribute('data-view-mode')
    expect(fourth).toBe(initial)
    // Sanity: three intermediate values are all distinct.
    expect(new Set([initial, second, third]).size).toBe(3)
  })

  test('persists view mode selection in localStorage', async ({ page }) => {
    const toggle = page.getByTestId('view-mode-toggle')
    const initial = await toggle.getAttribute('data-view-mode')
    await toggle.click()
    await expect(toggle).not.toHaveAttribute('data-view-mode', initial!)
    const afterClick = await toggle.getAttribute('data-view-mode')

    await page.reload()
    await page.waitForSelector('aside h2:has-text("Projects")')
    // Re-hydrate before reading the restored attribute (see beforeEach for context).
    await page.waitForLoadState('networkidle')

    const restoredToggle = page.getByTestId('view-mode-toggle')
    await expect(restoredToggle).toHaveAttribute('data-view-mode', afterClick!)
    const restored = await restoredToggle.getAttribute('data-view-mode')
    expect(restored).toBe(afterClick)
  })

  test('switches to flat mode and renders a flat project list', async ({ page }) => {
    const toggle = page.getByTestId('view-mode-toggle')
    // Click until we land on flat mode. Wait for each click to settle before
    // reading the next value so the cycle isn't ahead of the DOM update.
    for (let i = 0; i < 3; i++) {
      const current = await toggle.getAttribute('data-view-mode')
      if (current === 'flat') break
      const before = current
      await toggle.click()
      await expect(toggle).not.toHaveAttribute('data-view-mode', before!)
    }
    await expect(toggle).toHaveAttribute('data-view-mode', 'flat')

    // The tree container should show no group rows in flat mode.
    const groupRows = page.getByTestId('project-group')
    await expect(groupRows).toHaveCount(0)
  })
})
