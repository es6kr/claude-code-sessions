# CLAUDE.md

Claude Code sessions monorepo - Effect-TS based session management library

## Project Structure

- `packages/core` - Core library (npm: @claude-sessions/core)
- `packages/web` - SvelteKit web UI (npm: @claude-sessions/web)

## Important: Open Source Project

This is an **English-only open source project**:
- All code comments, variable names, commit messages in English
- Documentation in English
- Include `-s` flag when committing (sign-off)

## Development Workflow

### Version Management

Always use `npm version` command for version bumps:

```bash
# Patch version (0.1.5 -> 0.1.6)
pnpm version patch

# Minor version (0.1.5 -> 0.2.0)
pnpm version minor

# Specific version
pnpm version 0.2.0
```

### Web UI Testing

After modifying web features, always test with Playwright:

1. Start dev server: `pnpm dev`
2. Test functionality with Playwright
3. **Keep browser open** for user verification (don't close)

## Tech Stack

- **Core**: TypeScript, Effect-TS
- **Web**: SvelteKit 5, TailwindCSS 4, adapter-node
- **Build**: tsup, Vite
- **Package Manager**: pnpm workspace

## Commands

```bash
# Full build
pnpm build

# Core package
cd packages/core
pnpm build
pnpm test

# Web package
cd packages/web
pnpm dev      # Dev server
pnpm build    # Production build
```
