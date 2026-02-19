import * as vscode from 'vscode'

export class SearchViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onFilterChange: (text: string) => void
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _context: vscode.WebviewViewResolveContext,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
    }

    webviewView.webview.html = this.getHtml()

    webviewView.webview.onDidReceiveMessage((message: { command: string; text: string }) => {
      if (message.command === 'filter') {
        this.onFilterChange(message.text)
      }
    })
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      padding: 4px 8px;
      margin: 0;
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 6px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      outline: none;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    input:focus {
      border-color: var(--vscode-focusBorder);
    }
    input::placeholder {
      color: var(--vscode-input-placeholderForeground);
    }
  </style>
</head>
<body>
  <input type="text" id="filter" placeholder="Filter sessions..." spellcheck="false" />
  <script>
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('filter');
    let debounceTimer;
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        vscode.postMessage({ command: 'filter', text: input.value });
      }, 150);
    });
    input.focus();
  </script>
</body>
</html>`
  }
}
