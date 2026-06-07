# Changelog

## [0.4.9-beta.4](https://github.com/es6kr/claude-code-sessions/compare/vscode-v0.4.0...vscode-v0.4.9-beta.4) (2026-06-06)

### Features

- add date grouping toggle for session list ([a6fc0de](https://github.com/es6kr/claude-code-sessions/commit/a6fc0de2cb4bbaa1e20a886047b7b00eccaf201a))
- add date grouping toggle for session list ([9e43436](https://github.com/es6kr/claude-code-sessions/commit/9e43436ed68f79f8e41d80da68811a39915efa69))
- add date grouping toggle for session list ([75acc2f](https://github.com/es6kr/claude-code-sessions/commit/75acc2fccb076b14b2bcceaef76b1cf62a15ff91))
- add title display mode (date/time vs message) ([493983b](https://github.com/es6kr/claude-code-sessions/commit/493983bcfe9a45a5551082a70f233a7ba07c3b4d))
- add title display mode setting to show date/time instead of first message ([504b3fb](https://github.com/es6kr/claude-code-sessions/commit/504b3fb0c8f643ce9bc6b28f65e553b9036166fc))
- add ValidationBadge component with progress message detection ([dfa69f2](https://github.com/es6kr/claude-code-sessions/commit/dfa69f245a449d76b2e6b3f372abbbba1f3498b2))
- **core,web,vscode:** add session sorting and optimize performance ([c5bc61f](https://github.com/es6kr/claude-code-sessions/commit/c5bc61f7b46dde5a024982244c130a4a653aa156))
- **core:** add agent-title support and fix custom-title last-occurrence ([e64efad](https://github.com/es6kr/claude-code-sessions/commit/e64efad7f194c5ca0f01b2d73aec35c114fb5ed7))
- **core:** add agent-title support and fix custom-title to use last occurrence ([3dc8bc5](https://github.com/es6kr/claude-code-sessions/commit/3dc8bc55e95855c35c091beaed5426dc3fedde18))
- **core:** centralize sortProjects and maskHomePath utilities ([bf80552](https://github.com/es6kr/claude-code-sessions/commit/bf8055244da69bae7b35a6f031d102f4ae489f26))
- **core:** change default sort from summary to updated timestamp ([4c0fc56](https://github.com/es6kr/claude-code-sessions/commit/4c0fc569d85cc1bb44afe405da2ecd78719869c0)), closes [#45](https://github.com/es6kr/claude-code-sessions/issues/45)
- **core:** display summary in target session by leafUuid resolution ([e17469b](https://github.com/es6kr/claude-code-sessions/commit/e17469bc50bd83d3959bd7f2a1104e912ee78ede))
- **core:** improve project matching for moved sessions ([6706657](https://github.com/es6kr/claude-code-sessions/commit/670665793ad8a66b59153ad197464752404a1937))
- **core:** sort projects by recency and detect stale project directories ([e6fcb74](https://github.com/es6kr/claude-code-sessions/commit/e6fcb74ff0b4cbd86b7974d72166d1a70db59a07))
- **core:** sort projects by recency, detect stale directories ([b275f10](https://github.com/es6kr/claude-code-sessions/commit/b275f1025cb559e72d8805768c42d52efb5e8779))
- **extension:** add cliFlags setting for extra CLI arguments ([d03c1b9](https://github.com/es6kr/claude-code-sessions/commit/d03c1b93e97e87d79bb31ed7a48cedbbc7a92481))
- **extension:** add Cmd+F / Ctrl+F keybinding for session filter ([7469983](https://github.com/es6kr/claude-code-sessions/commit/746998375175d5643f9a5005482a9a0e3c146b28))
- **extension:** add defaultTerminalMode and cliFlags settings ([8fe8fc0](https://github.com/es6kr/claude-code-sessions/commit/8fe8fc035858f1ffd0041c29f6be3793da26e447))
- **extension:** add defaultTerminalMode setting ([ad8f62e](https://github.com/es6kr/claude-code-sessions/commit/ad8f62e49db2d8a5b8c6ef3c796606cbc2f57590))
- **extension:** add packageTag setting and deprecate useBetaVersion ([#36](https://github.com/es6kr/claude-code-sessions/issues/36)) ([f12e0a8](https://github.com/es6kr/claude-code-sessions/commit/f12e0a80470d66a78d5376d8f934845e85a4b29b))
- **extension:** add terminal and YOLO context menu commands ([d67ed71](https://github.com/es6kr/claude-code-sessions/commit/d67ed713a9220c8fc418aab962f13de0ff8f279b))
- **extension:** add terminal, YOLO, and resume context menu commands ([0633b90](https://github.com/es6kr/claude-code-sessions/commit/0633b906a5e001f3f3d63c2482eee6a8161d4b76))
- **extension:** enable tree view search via getParent() ([96caddc](https://github.com/es6kr/claude-code-sessions/commit/96caddc3dec049d010d8763b0a9b2db392cafc0c))
- hierarchical project tree with folder grouping (web + vscode) ([#156](https://github.com/es6kr/claude-code-sessions/issues/156)) ([b0dc65e](https://github.com/es6kr/claude-code-sessions/commit/b0dc65e28e5a42a876222589c9183f99f4ae67df)), closes [#152](https://github.com/es6kr/claude-code-sessions/issues/152)
- improve session title display with getDisplayTitle ([af677b2](https://github.com/es6kr/claude-code-sessions/commit/af677b28b1435db1c31d07b80b477c30674aa078))
- include project/directory name in session search ([20d52fe](https://github.com/es6kr/claude-code-sessions/commit/20d52fe9b1d2eb4a0b1516281d14d0717597fdae))
- show session ID in tree item tooltip ([eb61363](https://github.com/es6kr/claude-code-sessions/commit/eb61363e50a70c9b4836841b20dc798535ba276c))
- simplify session title chain + add secondary metadata line ([#153](https://github.com/es6kr/claude-code-sessions/issues/153)) ([117b1a1](https://github.com/es6kr/claude-code-sessions/commit/117b1a1e87b87cc3e0aaaa4bf4b87086de692775))
- **vscode:** add JSONL Custom Editor preview + UI-share Phase 1 ([d736046](https://github.com/es6kr/claude-code-sessions/commit/d736046a25a243690bd7b2453fcbb31664892fd0))
- **vscode:** add Resume Session command ([f04d0fa](https://github.com/es6kr/claude-code-sessions/commit/f04d0fac03124dca970ef7a7d705bd1059d2afc1))
- **vscode:** add startClaudeInFolder + toolbar buttons for project commands ([8057dc8](https://github.com/es6kr/claude-code-sessions/commit/8057dc8b978a9afc964b88e076db3ed87ce05ac5))
- **vscode:** add startClaudeInFolder + toolbar buttons, extract startClaude helper ([299849d](https://github.com/es6kr/claude-code-sessions/commit/299849d6b1b94ffcd2077a81905c772bf5c45a2d))
- **vscode:** add startClaudeInFolder command and toolbar buttons for 3 project commands ([db106c8](https://github.com/es6kr/claude-code-sessions/commit/db106c869cbb25e843e0f30f3be6d0d42b7f44c0))
- **vscode:** add todos and agents tree groups ([92717c9](https://github.com/es6kr/claude-code-sessions/commit/92717c93ca14f98c17ab0a573a8c39e4f31e447e))
- **vscode:** add useBetaVersion setting for web package ([938a843](https://github.com/es6kr/claude-code-sessions/commit/938a843ca933483ad334549edf85434fb2127a2a))
- **vscode:** add webview e2e tests and project filtering ([8f0b98f](https://github.com/es6kr/claude-code-sessions/commit/8f0b98fcddac1a57093a657ec21a777b13ebca0a))
- **vscode:** apply defaultTerminalMode to openTerminalHere command ([fdeaaae](https://github.com/es6kr/claude-code-sessions/commit/fdeaaaee9d4517e737c341e69d420cd2215a0c87))
- **vscode:** apply defaultTerminalMode to openTerminalHere command ([#134](https://github.com/es6kr/claude-code-sessions/issues/134)) ([2473c44](https://github.com/es6kr/claude-code-sessions/commit/2473c44b4ca8f50b7e0fb90d130ce0537d04246c))
- **vscode:** apply defaultTerminalMode to openTerminalHere command ([#135](https://github.com/es6kr/claude-code-sessions/issues/135)) ([fdeaaae](https://github.com/es6kr/claude-code-sessions/commit/fdeaaaee9d4517e737c341e69d420cd2215a0c87))
- **vscode:** opt-in stale-project cleanup with explicit confirmation ([2dd99f5](https://github.com/es6kr/claude-code-sessions/commit/2dd99f5cb7736e023fa782f989a241cf50f0445f))
- **web:** add Storybook stories and screenshot to README ([3adc311](https://github.com/es6kr/claude-code-sessions/commit/3adc311b996bfe84363f09ee959ce5e272600749))
- **web:** replace hand-rolled CLI parser with Commander.js ([9a2d040](https://github.com/es6kr/claude-code-sessions/commit/9a2d040c3a6818fc92a26553529f4ae8188b0bca))
- **web:** replace hand-rolled CLI parser with Commander.js ([#120](https://github.com/es6kr/claude-code-sessions/issues/120)) ([9a2d040](https://github.com/es6kr/claude-code-sessions/commit/9a2d040c3a6818fc92a26553529f4ae8188b0bca))

### Bug Fixes

- address CodeRabbit review feedback on PR [#70](https://github.com/es6kr/claude-code-sessions/issues/70) ([f8dbd12](https://github.com/es6kr/claude-code-sessions/commit/f8dbd126f1ef6cb0240ca3c2286aba8add81000c))
- address Copilot and CodeRabbit review feedback on PR [#33](https://github.com/es6kr/claude-code-sessions/issues/33) ([589b023](https://github.com/es6kr/claude-code-sessions/commit/589b0239094ec3ce5a13f5e979a96dbafcccec5f))
- address PR [#70](https://github.com/es6kr/claude-code-sessions/issues/70) review findings and SSR localStorage error ([#81](https://github.com/es6kr/claude-code-sessions/issues/81)) ([577118a](https://github.com/es6kr/claude-code-sessions/commit/577118a8e02b04ada638bc198ed79e4ffec0bc10))
- address PR review feedback for date grouping ([39afd68](https://github.com/es6kr/claude-code-sessions/commit/39afd6810cc8f2c332f1ceaa26975a6cc48249d9))
- address review feedback for cleanup and projects ([4440f4c](https://github.com/es6kr/claude-code-sessions/commit/4440f4c9265843f7d927a6c97bb2c79dc8d7dc85))
- address security and UX review feedback ([aee31a3](https://github.com/es6kr/claude-code-sessions/commit/aee31a35db77d6a8edb695d178b4825280f61bc9))
- **core:** rename agent-title to agent-name to match actual JSONL format ([9d475b6](https://github.com/es6kr/claude-code-sessions/commit/9d475b629359371d5567b33958684b2d4cd9b2c0))
- **core:** use forward slash as path separator ([a02be0d](https://github.com/es6kr/claude-code-sessions/commit/a02be0d083dce8adbd994e2035125314c8d6c4da))
- **core:** use latest custom-title and remove summary fallback ([#126](https://github.com/es6kr/claude-code-sessions/issues/126)) ([605b112](https://github.com/es6kr/claude-code-sessions/commit/605b112cb80d65671efc0c3182f156742056fc30))
- **extension:** address CodeRabbit review feedback on PR [#25](https://github.com/es6kr/claude-code-sessions/issues/25) ([250609b](https://github.com/es6kr/claude-code-sessions/commit/250609b416cd76ff1dcdd035e6b02c433c464233))
- **extension:** address Copilot review feedback on PR [#25](https://github.com/es6kr/claude-code-sessions/issues/25) ([e4da4c3](https://github.com/es6kr/claude-code-sessions/commit/e4da4c3894136b366fb90d6bda5b01cd5fa2c1bc))
- **extension:** restore restartExtensionHost button and simplify view title ([9f181b4](https://github.com/es6kr/claude-code-sessions/commit/9f181b48c72cd4e8176e957fb95fb95bc4c8a519))
- official Claude Code path conversion and CI improvements ([#14](https://github.com/es6kr/claude-code-sessions/issues/14)) ([e3fdf1a](https://github.com/es6kr/claude-code-sessions/commit/e3fdf1a32ead5327ea957bcd3e3c99d3dacea201))
- **test:** add HTTP status verification to vscode-extension webview tests ([#115](https://github.com/es6kr/claude-code-sessions/issues/115), [#116](https://github.com/es6kr/claude-code-sessions/issues/116)) ([59e00a0](https://github.com/es6kr/claude-code-sessions/commit/59e00a0576f63a888217d9dcb20af833fd2fbbec))
- use display path for project name in date-grouped view ([9ba43bb](https://github.com/es6kr/claude-code-sessions/commit/9ba43bbbd4e3522d6790430f79d848de28d71e08))
- **vscode:** always show session as collapsible ([818fdcd](https://github.com/es6kr/claude-code-sessions/commit/818fdcd7b527f49a7845300a83ac6531c957b1f4))
- **vscode:** match tree relative time to active sort field ([11d14c1](https://github.com/es6kr/claude-code-sessions/commit/11d14c1e27be97e6c591ab9d28d4acf363489b2b))
- **vscode:** resolve drag and drop crash by using DTOs for data transfer ([0b78dba](https://github.com/es6kr/claude-code-sessions/commit/0b78dba321657cad61149e47e060c17d737da149))
- **vscode:** resolve duplicate tree item ID errors on expansion ([73df9c4](https://github.com/es6kr/claude-code-sessions/commit/73df9c4155b48c24f65c5ae28c409343f505c522))
- **vscode:** support multi-select for move session command ([fda2a19](https://github.com/es6kr/claude-code-sessions/commit/fda2a19b91bbdb3ffa56da947ade1f3e83daa735))
- **vscode:** use asExternalUri for remote environment support ([73d94ab](https://github.com/es6kr/claude-code-sessions/commit/73d94abd923e7a07ec6ce4f097b59969c1ef1c5b)), closes [#18](https://github.com/es6kr/claude-code-sessions/issues/18)

### Performance Improvements

- **core,extension:** metadata cache, native session filter, strict parsing ([3362258](https://github.com/es6kr/claude-code-sessions/commit/3362258ee93f31773f56afb4e66fc61b26962fe2))
- **extension:** deduplicate concurrent getProjectData loads ([a9cdc6a](https://github.com/es6kr/claude-code-sessions/commit/a9cdc6a29383624cfa546b21dfa60e5cd5a3eaa3))
- **extension:** eliminate listProjects bottleneck + add WebviewView filter ([b94b810](https://github.com/es6kr/claude-code-sessions/commit/b94b810b61b05df64bede7aa82d52db5726359b7))
- **extension:** use bounded concurrency for filtered project loading ([ae78d45](https://github.com/es6kr/claude-code-sessions/commit/ae78d4539132a3e0b3a9642a56ddc15ec90b9aa1))
- **extension:** use concurrent loading in filter getChildren loop ([4ed3d14](https://github.com/es6kr/claude-code-sessions/commit/4ed3d141e5fd8907f131bc554cf4ac8ad0ebe565)), closes [#32](https://github.com/es6kr/claude-code-sessions/issues/32)

## v0.4.0

[compare changes](https://github.com/es6kr/claude-code-sessions/compare/vscode-v0.3.7...vscode-v0.4.0)

### 🚀 Enhancements

- **core:** Add sessions-index.json support and sort options ([f841290](https://github.com/es6kr/claude-code-sessions/commit/f841290))
- **vscode:** Add sort sessions UI button ([efad608](https://github.com/es6kr/claude-code-sessions/commit/efad608))

### ❤️ Contributors

- Hayoung Jeong <drumrobot43@gmail.com>

## v0.3.7

[compare changes](https://github.com/es6kr/claude-code-sessions/compare/vscode-v0.3.6...vscode-v0.3.7)

### 🚀 Enhancements

- **core:** Filter error sessions from tree view ([ca50f37](https://github.com/es6kr/claude-code-sessions/commit/ca50f37))
- **core:** Add session analysis, compression, and summarization ([c7b2c2e](https://github.com/es6kr/claude-code-sessions/commit/c7b2c2e))
- **core:** Detect and auto-delete orphan agents in subagents folders ([bc8bb08](https://github.com/es6kr/claude-code-sessions/commit/bc8bb08))

### 🩹 Fixes

- **mcp:** Use workspace protocol for core dependency ([197e635](https://github.com/es6kr/claude-code-sessions/commit/197e635))
- **mcp:** Add non-null assertion for backupPath in test ([24d3232](https://github.com/es6kr/claude-code-sessions/commit/24d3232))
- **vscode:** Support multi-select for move session command ([fda2a19](https://github.com/es6kr/claude-code-sessions/commit/fda2a19))

### 🏡 Chore

- Bump version to 0.3.6 ([c6d0154](https://github.com/es6kr/claude-code-sessions/commit/c6d0154))
- Bump version to 0.3.7 ([37de12d](https://github.com/es6kr/claude-code-sessions/commit/37de12d))
- Add changelogen for automatic changelog generation ([bd0d529](https://github.com/es6kr/claude-code-sessions/commit/bd0d529))

### ✅ Tests

- **mcp:** Add comprehensive unit tests for MCP tools ([dc00d7c](https://github.com/es6kr/claude-code-sessions/commit/dc00d7c))

### ❤️ Contributors

- Hayoung Jeong <drumrobot43@gmail.com>
