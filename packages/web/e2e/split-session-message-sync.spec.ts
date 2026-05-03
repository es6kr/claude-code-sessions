import { test, expect } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT = '-Users-test-project'
const SESSION = 'session-split-askuserquestion'
const FIXTURE_PATH = path.resolve(
  __dirname,
  `../../test-fixtures/sessions/${PROJECT}/${SESSION}.jsonl`
)

// Fixture: a session containing an AskUserQuestion tool_result message.
// Splitting at msg3 should cause the server to apply cleanupSplitFirstMessage,
// transforming the toolUseResult.answers into a "Q: ... A: ..." text message.
const ORIGINAL_FIXTURE =
  [
    '{"type":"user","uuid":"split-msg-1","sessionId":"session-split-askuserquestion","timestamp":"2025-12-23T04:00:00.000Z","message":{"role":"user","content":[{"type":"text","text":"Pick a color"}]}}',
    '{"type":"assistant","uuid":"split-msg-2","parentUuid":"split-msg-1","sessionId":"session-split-askuserquestion","timestamp":"2025-12-23T04:00:10.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"toolu_aq01","name":"AskUserQuestion","input":{"questions":[{"question":"Favorite color?","header":"Color","options":[{"label":"red","description":"red"},{"label":"blue","description":"blue"}],"multiSelect":false}]}}]}}',
    '{"type":"user","uuid":"split-msg-3","parentUuid":"split-msg-2","sessionId":"session-split-askuserquestion","timestamp":"2025-12-23T04:00:11.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_aq01","content":"User answered"}]},"toolUseResult":{"questions":[{"question":"Favorite color?","header":"Color","options":[{"label":"red","description":"red"},{"label":"blue","description":"blue"}],"multiSelect":false}],"answers":{"Favorite color?":"blue"}}}',
    '{"type":"assistant","uuid":"split-msg-4","parentUuid":"split-msg-3","sessionId":"session-split-askuserquestion","timestamp":"2025-12-23T04:00:30.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Got it, blue."}]}}',
  ].join('\n') + '\n'

test.describe('Split Session - Message List Sync', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    fs.writeFileSync(FIXTURE_PATH, ORIGINAL_FIXTURE)
    await page.goto(`/session/${PROJECT}/${SESSION}`)
    await page.waitForSelector('button:has-text("Messages")', { timeout: 10000 })
  })

  test.afterAll(() => {
    fs.writeFileSync(FIXTURE_PATH, ORIGINAL_FIXTURE)
    // Clean up any new sessions created by split (they have UUID filenames)
    const projectDir = path.dirname(FIXTURE_PATH)
    const files = fs.readdirSync(projectDir)
    for (const f of files) {
      // Match UUID-style filenames (8-4-4-4-12 hex)
      if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jsonl$/.test(f)) {
        fs.unlinkSync(path.join(projectDir, f))
      }
    }
  })

  test('should reload messages from server after split so cleaned Q/A text is visible', async ({
    page,
  }) => {
    // The default filter hides tool_result messages. Switch to "All" to see them.
    await page.locator('button:has-text("All")').first().click()

    // Locate the AskUserQuestion tool_result message (split-msg-3).
    // Before split: rendered as a tool_result (OUT label) with raw payload.
    // After split: the same uuid becomes the first message, transformed to "Q: ... A: ..." text.
    const targetMsg = page.locator('[data-msg-id="split-msg-3"]')
    await expect(targetMsg).toBeVisible()

    // The split button (✂️) is hidden via opacity until hover; click with force to bypass.
    // TooltipButton uses a custom tooltip span and does NOT set a native title attribute,
    // so we locate by visible text content.
    const splitBtn = targetMsg.locator('button:has-text("✂️")')
    await splitBtn.click({ force: true })

    // Confirm the split modal.
    const confirmModal = page.locator('[class*="fixed"]:has(button:has-text("Confirm"))')
    await expect(confirmModal).toBeVisible()
    await confirmModal.locator('button:has-text("Confirm")').click()

    // After split, the message list should reload from server.
    // The first message (split-msg-3) should now show the cleaned "Q: ... A: ..." text.
    const firstMsg = page.locator('[data-msg-id="split-msg-3"]')
    await expect(firstMsg).toBeVisible({ timeout: 10000 })
    await expect(firstMsg).toContainText('Q: Favorite color?')
    await expect(firstMsg).toContainText('A: blue')
  })
})
