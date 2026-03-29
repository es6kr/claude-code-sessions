import * as vscode from 'vscode'

/**
 * Ensure extension is loaded and activated.
 * Calls this.skip() if extension is not found (visible in Mocha output).
 */
export async function ensureExtensionActive(
  ctx: Mocha.Context
): Promise<vscode.Extension<unknown>> {
  ctx.timeout(30000)
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const extension = vscode.extensions.getExtension('es6kr.claude-sessions')
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
