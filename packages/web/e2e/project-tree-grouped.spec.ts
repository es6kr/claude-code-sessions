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

    await toggle.click()
    const second = await toggle.getAttribute('data-view-mode')
    expect(second).not.toBe(initial)

    await toggle.click()
    const third = await toggle.getAttribute('data-view-mode')
    expect(third).not.toBe(second)

    // Cycle returns to original after three clicks (3-state toggle).
    await toggle.click()
    const fourth = await toggle.getAttribute('data-view-mode')
    expect(fourth).toBe(initial)
  })

  test('persists view mode selection in localStorage', async ({ page }) => {
    const toggle = page.getByTestId('view-mode-toggle')
    await toggle.click()
    const afterClick = await toggle.getAttribute('data-view-mode')

    await page.reload()
    await page.waitForSelector('aside h2:has-text("Projects")')

    const restored = await page.getByTestId('view-mode-toggle').getAttribute('data-view-mode')
    expect(restored).toBe(afterClick)
  })

  test('switches to flat mode and renders a flat project list', async ({ page }) => {
    const toggle = page.getByTestId('view-mode-toggle')
    // Click until we land on flat mode.
    for (let i = 0; i < 3; i++) {
      const current = await toggle.getAttribute('data-view-mode')
      if (current === 'flat') break
      await toggle.click()
    }
    await expect(toggle).toHaveAttribute('data-view-mode', 'flat')

    // The tree container should show no group rows in flat mode.
    const groupRows = page.getByTestId('project-group')
    await expect(groupRows).toHaveCount(0)
  })
})
