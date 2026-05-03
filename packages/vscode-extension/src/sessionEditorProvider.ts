import * as vscode from 'vscode'
import { outputChannel } from './output'

/**
 * Custom Editor provider for `.jsonl` session files (SPIKE).
 *
 * This is the de-risking spike for Issue #138. It validates:
 *  - The Vite + Svelte 5 + Tailwind 4 webview bundle loads inside a webview.
 *  - The CSP we generate is permissive enough for the bundle to execute.
 *  - The extension ↔ webview `postMessage` round-trip works for JSONL content.
 *
 * It deliberately does NOT include:
 *  - The full SessionViewer / MessageList component tree (Phase 1).
 *  - File watcher integration for live reload (Phase 1).
 *  - Mutation support — rename, compress, delete (Phase 2).
 *
 * Registered with `priority: 'option'` so it never replaces the default editor;
 * users opt in via "Open With…" → "Claude Session Preview".
 */
export const SESSION_EDITOR_VIEW_TYPE = 'claudeSessions.jsonlPreview'

export class SessionEditorProvider implements vscode.CustomReadonlyEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return {
      uri,
      dispose() {
        // No resources to release for the spike — Phase 1 will own a file watcher.
      },
    }
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    const webview = webviewPanel.webview
    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')

    webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewRoot],
    }

    webview.html = this.buildHtml(webview, webviewRoot)

    // Send the JSONL content as soon as the webview signals readiness.
    const sendSession = async () => {
      try {
        const bytes = await vscode.workspace.fs.readFile(document.uri)
        const content = new TextDecoder('utf-8').decode(bytes)
        webview.postMessage({
          type: 'load-session',
          filePath: document.uri.fsPath,
          content,
        })
      } catch (err) {
        outputChannel.appendLine(
          `[sessionEditorProvider] Failed to read ${document.uri.fsPath}: ${err}`
        )
        webview.postMessage({
          type: 'load-session',
          filePath: document.uri.fsPath,
          content: '',
        })
      }
    }

    const messageDisposable = webview.onDidReceiveMessage((msg: { type?: string }) => {
      if (msg?.type === 'ready') {
        void sendSession()
      }
    })

    webviewPanel.onDidDispose(() => {
      messageDisposable.dispose()
    })
  }

  /**
   * Build the webview HTML shell. Loads the bundled Svelte app from
   * `dist/webview/assets/{main.js,style.css}` via `webview.asWebviewUri`.
   *
   * CSP notes:
   *  - `default-src 'none'` is the safe baseline.
   *  - `style-src` allows the bundled CSS plus inline styles (Svelte may emit them).
   *  - `script-src` is restricted to bundled JS plus a per-load nonce for the inline bootstrap.
   *  - `img-src` allows `data:` for icons and `https:` placeholders if Phase 1 needs them.
   */
  private buildHtml(webview: vscode.Webview, webviewRoot: vscode.Uri): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'main.js'))
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewRoot, 'assets', 'style.css'))
    const nonce = generateNonce()

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    img-src ${webview.cspSource} https: data:;
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}' ${webview.cspSource};
    font-src ${webview.cspSource};
  " />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Claude Session Preview</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 32; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return out
}
