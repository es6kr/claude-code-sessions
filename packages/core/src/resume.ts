/**
 * Resume session functionality - Server-side only
 * This module uses child_process and should NOT be imported in browser environments
 */
import { spawn } from 'node:child_process'
import type { ResumeSessionOptions, ResumeSessionResult } from './types.js'

/**
 * Resume a session using claude CLI
 * On macOS: opens Terminal.app with claude --resume command
 * On other platforms: spawns a detached process with appropriate terminal
 */
export const resumeSession = (options: ResumeSessionOptions): ResumeSessionResult => {
  const { sessionId, cwd, fork = false, args = [] } = options

  try {
    const claudeArgs = ['--resume', sessionId]
    if (fork) {
      claudeArgs.push('--fork-session')
    }
    claudeArgs.push(...args)

    const claudeCommand = `claude ${claudeArgs.join(' ')}`
    const workingDir = cwd ?? process.cwd()

    // macOS: use osascript to open Terminal.app and run command
    if (process.platform === 'darwin') {
      // AppleScript to open new Terminal window, cd to directory, and run command
      const escapedDir = workingDir.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const escapedCmd = claudeCommand.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const script = `
tell application "Terminal"
  activate
  set newWindow to do script "cd \\"${escapedDir}\\" && ${escapedCmd}"
  set frontmost of newWindow to true
end tell
tell application "System Events"
  set frontmost of process "Terminal" to true
end tell
`
      const child = spawn('osascript', ['-e', script], {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()

      return { success: true, pid: child.pid }
    }

    // Windows: use start cmd
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', 'cmd', '/k', claudeCommand], {
        cwd: workingDir,
        detached: true,
        stdio: 'ignore',
      })
      child.unref()

      return { success: true, pid: child.pid }
    }

    // Linux: try common terminal emulators
    const terminals = ['gnome-terminal', 'konsole', 'xterm']
    for (const term of terminals) {
      try {
        const child = spawn(term, ['--', 'bash', '-c', `cd "${workingDir}" && ${claudeCommand}`], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        return { success: true, pid: child.pid }
      } catch {
        continue
      }
    }

    return { success: false, error: 'No supported terminal emulator found' }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
