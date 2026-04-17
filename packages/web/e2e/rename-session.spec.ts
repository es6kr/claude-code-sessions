import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = '-Users-test-project'
const SESSION = 'session-with-agent-name'
const FIXTURE_PATH = path.resolve(
  __dirname,
  `../../test-fixtures/sessions/${PROJECT}/${SESSION}.jsonl`
)
const ORIGINAL_FIXTURE =
  [
    '{"type":"agent-name","agentName":"Skill Sync Agent","sessionId":"session-with-agent-name"}',
    '{"type":"custom-title","customTitle":"Skill Sync Session","sessionId":"session-with-agent-name"}',
    '{"type":"user","uuid":"agent-msg-1","timestamp":"2025-12-22T04:00:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Sync all skills"}]}}',
    '{"type":"assistant","uuid":"agent-msg-2","parentUuid":"agent-msg-1","timestamp":"2025-12-22T04:00:30.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Starting skill sync."}]}}',
  ].join('\n') + '\n'

test.describe('Rename Session - Detail Page', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    fs.writeFileSync(FIXTURE_PATH, ORIGINAL_FIXTURE)
    await page.goto(`/session/${PROJECT}/${SESSION}`)
    await page.waitForSelector('button:has-text("Messages")', { timeout: 10000 })
  })

  test.afterAll(() => {
    fs.writeFileSync(FIXTURE_PATH, ORIGINAL_FIXTURE)
  })

  test('should show custom-title and agent-name in message list', async ({ page }) => {
    const agentNameMsg = page.locator('.bg-blue-500\\/15')
    const customTitleMsg = page.locator('.bg-purple-500\\/15')

    await expect(agentNameMsg.first()).toBeVisible()
    await expect(customTitleMsg.first()).toBeVisible()
    await expect(agentNameMsg.first()).toContainText('Skill Sync Agent')
    await expect(customTitleMsg.first()).toContainText('Skill Sync Session')
  })

  test('should rename and reflect in page title and message list', async ({ page }) => {
    const renameBtn = page.locator('button:has(svg path[d*="15.232"])')
    await renameBtn.click()

    const modal = page.locator('[class*="fixed"]:has(button:has-text("Save"))')
    await expect(modal).toBeVisible()

    const input = modal.locator('input')
    await input.clear()
    await input.fill('Renamed E2E Title')
    await modal.locator('button:has-text("Save")').click()

    await expect(page).toHaveTitle(/Renamed E2E Title/)

    const agentNameMsg = page.locator('.bg-blue-500\\/15')
    const customTitleMsg = page.locator('.bg-purple-500\\/15')

    await expect(customTitleMsg.first()).toContainText('Renamed E2E Title')
    await expect(agentNameMsg.first()).toContainText('Renamed E2E Title')
  })

  test('should clear title when rename with empty input', async ({ page }) => {
    const renameBtn = page.locator('button:has(svg path[d*="15.232"])')
    await renameBtn.click()

    const modal = page.locator('[class*="fixed"]:has(button:has-text("Save"))')
    await expect(modal).toBeVisible()

    const input = modal.locator('input')
    await input.clear()
    await modal.locator('button:has-text("Save")').click()

    await expect(page).toHaveTitle(/Sync all skills/)

    const agentNameMsg = page.locator('.bg-blue-500\\/15')
    const customTitleMsg = page.locator('.bg-purple-500\\/15')

    await expect(agentNameMsg).toHaveCount(0)
    await expect(customTitleMsg).toHaveCount(0)
  })
})
