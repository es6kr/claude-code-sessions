# Contributing to claude-code-sessions

Thank you for contributing to the Claude Code session management tools!

## Development Setup

### Requirements

- Node.js 22+
- pnpm 9.15.0+ (managed via corepack)

### Installation

```bash
# Clone repository
git clone https://github.com/es6kr/claude-code-sessions.git
cd claude-code-sessions

# Install dependencies
pnpm install
```

## Monorepo Structure

```
claude-code-sessions/
├── packages/
│   ├── core/              # @claude-sessions/core - Shared library
│   │   └── src/
│   │       ├── types.ts   # Type definitions
│   │       ├── paths.ts   # Path utilities
│   │       ├── utils.ts   # Message utilities
│   │       ├── agents.ts  # Agent management
│   │       ├── todos.ts   # Todo management
│   │       └── session.ts # Session operations
│   ├── mcp/               # claude-sessions-mcp - MCP server
│   │   └── src/
│   │       └── index.ts   # MCP server entrypoint
│   └── web/               # @claude-sessions/web - SvelteKit UI
│       └── src/
│           ├── lib/       # Components and utilities
│           └── routes/    # SvelteKit routes
├── .editorconfig
├── eslint.config.js
├── package.json
└── pnpm-workspace.yaml
```

## Code Style

### EditorConfig

Project uses `.editorconfig` settings:

- **Charset:** UTF-8
- **End of Line:** LF
- **Indent:** 2 spaces
- **Final newline:** Required
- **Trailing whitespace:** Trimmed (except markdown)

### ESLint & Prettier

- **ESLint:** Applied to TypeScript and Svelte files
- **Prettier:** Auto-formatting
  - Print width: 100
  - Semi: false (no semicolons)
  - Single quote: true
  - Tab width: 2
  - Trailing comma: es5

### Running Lint

```bash
# Lint check (all packages)
pnpm lint

# Type check (all packages)
pnpm typecheck
```

## Commit Convention

Follow **Conventional Commits** format:

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, semicolons, etc.)
- `refactor:` Code refactoring without functional changes
- `test:` Add/update tests
- `chore:` Build process, tooling changes
- `ci:` CI/CD pipeline changes
- `perf:` Performance improvements

### Scope Examples

- `core` - Core library related
- `mcp` - MCP server related
- `web` - Web UI related

### Examples

```bash
feat(mcp): add session rename tool
fix(web): correct message display order
refactor(core): extract path utilities
docs: update installation guide
```

## Pre-commit Hook

Husky and lint-staged are configured automatically:

- Prettier auto-formatting
- ESLint auto-fix
- EditorConfig validation

Runs automatically before commit, no manual execution needed.

## Build & Development

### Core Library

```bash
# Build core library
pnpm build:core
```

### MCP Server

```bash
# MCP server dev mode
pnpm dev:mcp

# MCP server build
pnpm build:mcp
```

### Web UI

```bash
# Web UI dev server
pnpm dev

# Web UI build
pnpm build:web
```

### Full Build

```bash
# Build all packages (core → mcp → web)
pnpm build
```

## Package Dependencies

```
@claude-sessions/core (no dependencies)
        ↓
claude-sessions-mcp (depends on core)
        ↓
@claude-sessions/web (depends on core)
```

When modifying `@claude-sessions/core`, rebuild dependent packages:

```bash
pnpm build:core && pnpm build:mcp && pnpm build:web
```

## Pull Request Guide

1. **Create branch:** `feat/your-feature` or `fix/your-fix`
2. **Write code:** Follow code style guidelines
3. **Commit:** Use Conventional Commits format
4. **Test:** Verify build succeeds (`pnpm build`)
5. **Create PR:** Clearly describe changes

## License

MIT License - See LICENSE file for details.
