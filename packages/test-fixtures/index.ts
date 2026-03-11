import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Absolute path to the sessions fixture directory */
export const SESSIONS_DIR = path.join(__dirname, 'sessions')

/** Test project name (matches folder name) */
export const TEST_PROJECT_NAME = '-Users-test-project'

/** Session IDs (match JSONL filenames without extension) */
export const SESSION_IDS = {
  basic: 'session-basic',
  withSummary: 'session-with-summary',
  withCustomTitle: 'session-with-custom-title',
  withTools: 'session-with-tools',
  crossRef: 'session-cross-ref',
} as const
