/**
 * Resume/start session functionality - Server-side only
 * This module uses child_process and should NOT be imported in browser environments
 */
import { spawn } from 'node:child_process'
import type {
  OpenExternalTerminalOptions,
  ResumeSessionOptions,
  ResumeSessionResult,
  StartClaudeOptions,
} from './types.js'

/**
 * Start claude CLI in an external terminal window.
 * OS-specific: Terminal.app (macOS), cmd (Windows), gnome-terminal/konsole/xterm (Linux)
 */
export const startClaude = (options: StartClaudeOptions): ResumeSessionResult => {
  const { command, cwd } = options
  const workingDir = cwd ?? process.cwd()

  try {
    if (process.platform === 'darwin') {
      const escapedDir = workingDir.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const escapedCmd = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
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

    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', 'cmd', '/k', command], {
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
        const child = spawn(term, ['--', 'bash', '-c', `cd "${workingDir}" && ${command}`], {
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

/**
 * Resume a session using claude CLI in an external terminal
 */
export const resumeSession = (options: ResumeSessionOptions): ResumeSessionResult => {
  const { sessionId, cwd, fork = false, args = [] } = options

  const claudeArgs = ['--resume', sessionId]
  if (fork) {
    claudeArgs.push('--fork-session')
  }
  claudeArgs.push(...args)

  return startClaude({
    command: `claude ${claudeArgs.join(' ')}`,
    cwd,
  })
}

/**
 * Open the OS default terminal at the given directory without running a command.
 * OS-specific: Terminal.app (macOS), cmd (Windows), gnome-terminal/konsole/xterm (Linux)
 */
export const openExternalTerminal = (options: OpenExternalTerminalOptions): ResumeSessionResult => {
  const { cwd } = options

  try {
    if (process.platform === 'darwin') {
      const escapedDir = cwd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const script = `
tell application "Terminal"
  activate
  do script "cd \\"${escapedDir}\\""
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

    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${cwd}"`], {
        cwd,
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
        const args = term === 'gnome-terminal' ? ['--working-directory', cwd] : ['--workdir', cwd]
        const child = spawn(term, args, {
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
