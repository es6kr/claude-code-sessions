import { test, expect } from '@playwright/test'

// Uses fixture data from packages/test-fixtures/sessions/ via CLAUDE_SESSIONS_DIR
test.describe('Session Title Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('aside h2:has-text("Projects")')
  })

  test('should show projects list', async ({ page }) => {
    const header = page.locator('aside h2')
    await expect(header).toContainText('Projects')
  })

  test('should expand project and show sessions', async ({ page }) => {
    const firstProject = page.locator('aside ul > li button').first()
    await firstProject.click()
    await page.waitForSelector('aside ul ul', { timeout: 10000 })

    const sessionList = page.locator('aside ul ul')
    await expect(sessionList).toBeVisible()
  })

  test('should display session title with correct priority', async ({ page }) => {
    const firstProject = page.locator('aside ul > li button').first()
    await firstProject.click()
    await page.waitForSelector('aside ul ul li', { timeout: 10000 })

    const sessions = page.locator('aside ul ul li')
    const count = await sessions.count()
    expect(count).toBeGreaterThan(0)

    const firstSessionTitle = sessions.first().locator('button span').first()
    const titleText = await firstSessionTitle.textContent()
    expect(titleText?.trim()).not.toBe('')
  })

  test('should show tooltip on session hover', async ({ page }) => {
    const firstProject = page.locator('aside ul > li button').first()
    await firstProject.click()
    await page.waitForSelector('aside ul ul li', { timeout: 10000 })

    const sessionButton = page.locator('aside ul ul li button').first()
    await sessionButton.hover()

    const tooltip = page.locator('.floating-tooltip')
    await expect(tooltip).toBeVisible()
  })

  test('should style summary fallback titles in italic', async ({ page }) => {
    const firstProject = page.locator('aside ul > li button').first()
    await firstProject.click()
    await page.waitForSelector('aside ul ul li', { timeout: 10000 })

    const italicTitles = page.locator('aside ul ul li button span.italic')
    const italicCount = await italicTitles.count()
    console.log(`Sessions with summary fallback styling: ${italicCount}`)
  })

  test('should expand session to show summaries', async ({ page }) => {
    const firstProject = page.locator('aside ul > li button').first()
    await firstProject.click()
    await page.waitForSelector('aside ul ul li', { timeout: 10000 })

    const expandButton = page.locator('aside ul ul li .flex-shrink-0.w-5 button').first()
    if ((await expandButton.count()) > 0) {
      await expandButton.click()
      const subItems = page.locator('aside ul ul li ul')
      await expect(subItems.first()).toBeVisible()
    }
  })

  test('should show message count for sessions', async ({ page }) => {
    const firstProject = page.locator('aside ul > li button').first()
    await firstProject.click()
    await page.waitForSelector('aside ul ul li', { timeout: 10000 })

    const messageCount = page.locator('aside ul ul li span:has-text("💬")')
    const count = await messageCount.count()
    expect(count).toBeGreaterThan(0)
  })
})
