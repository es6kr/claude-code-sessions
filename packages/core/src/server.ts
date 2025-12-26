/**
 * Server-only exports for @claude-sessions/core
 * These modules use Node.js built-ins like child_process
 * and should NOT be imported in browser environments
 *
 * Usage: import { resumeSession } from '@claude-sessions/core/server'
 */

export { resumeSession } from './resume.js'
export type { ResumeSessionOptions, ResumeSessionResult } from './types.js'
