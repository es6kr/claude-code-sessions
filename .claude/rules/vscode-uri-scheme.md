# VSCode URI Scheme

## `vscode://` hardcode forbidden — use `vscode.env.uriScheme` (HARD STOP)

**Extension code must NOT hardcode `vscode://`, `vscode-insiders://`, or any literal IDE scheme.** Always derive the scheme dynamically via `vscode.env.uriScheme`.

### Why

- The VSCode core API contract requires every fork to implement `vscode.env.uriScheme` and return its own scheme:
  - VSCode → `vscode`
  - Cursor → `cursor`
  - Antigravity → `antigravity`
  - VSCodium → `vscodium`
- When `vscode://...` is hardcoded, `vscode.env.openExternal` hands the URI to the OS launcher (macOS Launch Services / Windows shell). The OS resolves the scheme to the **real VSCode app** even when the user is running a fork.
- Result: a user on Cursor or Antigravity who clicks "Resume in Claude Code Extension" sees VSCode boot up — the session resolution fails (the JSONL lives in the fork's project tree, not VSCode's) and an empty session opens.
- Anthropic's official `claude-code` extension is published to Open VSX (publisher `Anthropic`, v2.1.168+) and installs on every Open VSX-supported fork, so the in-process dispatch via `vscode.env.uriScheme` reaches the registered UriHandler natively.

### Don't / Do

| #   | Don't                                                                                                     | Do                                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ``vscode.Uri.parse(`vscode://publisher.extension/path`)``                                                 | ``vscode.Uri.parse(`${vscode.env.uriScheme}://publisher.extension/path`)``                                                                                                                                          |
| 2   | Comment that documents the URI shape with a literal scheme (`// vscode://anthropic.claude-code/open?...`) | Use a placeholder in comments: `// <ide-scheme>://anthropic.claude-code/open?...`                                                                                                                                   |
| 3   | Assume "vscode:// will be recognized by forks too"                                                        | Each fork only handles its own scheme in-process. Cross-scheme URIs fall back to the OS launcher → VSCode                                                                                                           |
| 4   | `vscode.commands.executeCommand('vscode.open', uri)` to invoke another extension's UriHandler             | Use `vscode.env.openExternal(uri)`. `vscode.open` resolves the URI as a file path (EntryNotFound) and does NOT trigger the registered UriHandler — verified end-to-end on the PoC branch `feat/resume-in-extension` |

### Self-check (before every edit that introduces a URI literal)

1. Does the new code contain a `vscode://` literal substring? — `grep 'vscode://'` mentally
2. If yes, replace with `${vscode.env.uriScheme}://`
3. Does a comment quote a URI shape with `vscode://`? — Replace with the `<ide-scheme>://` placeholder
4. For URI handler dispatch, use `vscode.env.openExternal(uri)` — never `vscode.commands.executeCommand('vscode.open', uri)` for cross-extension dispatch

### Scope

- Runtime extension code that constructs or quotes IDE URIs
- Comment-level URI shape documentation (use placeholders, not literals)

### Allowed exceptions

- README / user-facing docs that show "click `vscode://...` in VSCode" as a concrete user example
- Quoting upstream VSCode-only API docs (`vscode://docs/...`) when explicitly referencing a VSCode-specific behavior

Anything else in runtime extension code must derive the scheme from `vscode.env.uriScheme`.
