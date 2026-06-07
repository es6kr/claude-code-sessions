import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

// Resolve extension ID dynamically from package.json so the same helpers work
// on production (`es6kr.claude-sessions`) and ovsx-beta (`es6kr.claude-sessions-vscode`).
const extensionPkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf-8')
) as { publisher: string; name: string }
const EXTENSION_ID = `${extensionPkg.publisher}.${extensionPkg.name}`

/**
 * Ensure extension is loaded and activated.
 * Calls this.skip() if extension is not found (visible in Mocha output).
 */
export async function ensureExtensionActive(
  ctx: Mocha.Context
): Promise<vscode.Extension<unknown>> {
  ctx.timeout(30000)
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const extension = vscode.extensions.getExtension(EXTENSION_ID)
  if (!extension) {
    ctx.skip()
    // unreachable after skip, but satisfies TS return type
    throw new Error('Extension not found')
  }

  if (!extension.isActive) {
    await extension.activate()
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return extension
}
