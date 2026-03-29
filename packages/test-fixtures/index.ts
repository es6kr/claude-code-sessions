import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Absolute path to the sessions fixture directory */
export const SESSIONS_DIR = path.join(__dirname, 'sessions')

/** Project names (match folder names) */
export const PROJECTS = {
  apiServer: '-Users-test-api-server',
  cliTooling: '-Users-test-cli-tooling',
  demoWebapp: '-Users-test-demo-webapp',
  testProject: '-Users-test-project',
} as const

/** @deprecated Use PROJECTS.testProject instead */
export const TEST_PROJECT_NAME = PROJECTS.testProject

/** Session IDs (match JSONL filenames without extension) */
export const SESSION_IDS = {
  basic: 'session-basic',
  crossRef: 'session-cross-ref',
  withCustomTitle: 'session-with-custom-title',
  withSummary: 'session-with-summary',
  withTools: 'session-with-tools',
} as const
