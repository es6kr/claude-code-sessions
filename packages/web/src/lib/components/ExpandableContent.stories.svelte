<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ExpandableContent from './ExpandableContent.svelte'

  const { Story } = defineMeta({
    title: 'Components/ExpandableContent',
    component: ExpandableContent,
    tags: ['autodocs'],
    argTypes: {
      maxLines: {
        control: { type: 'number', min: 1, max: 50 },
      },
      lang: {
        control: 'select',
        options: [undefined, 'json', 'typescript', 'bash', 'javascript'],
      },
    },
    parameters: {
      layout: 'padded',
    },
  })

  const shortContent = `Line 1: This is a short content
Line 2: Only a few lines
Line 3: No expansion needed`

  const longContent = `Line 1: This is the beginning of a long content block
Line 2: It contains many lines of text
Line 3: That will need to be truncated
Line 4: Because there are more than maxLines
Line 5: The user can hover to see the expand button
Line 6: Clicking it will show all content
Line 7: And then they can collapse it again
Line 8: This is useful for log output
Line 9: Or any long text content
Line 10: That would take up too much space
Line 11: If displayed in full
Line 12: So we truncate it
Line 13: And show a gradient
Line 14: At the bottom
Line 15: To indicate more content`

  const jsonContent = `{
  "name": "claude-code-sessions",
  "version": "0.3.4",
  "description": "Session management for Claude Code",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest",
    "lint": "eslint src"
  },
  "dependencies": {
    "effect": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "tsup": "^8.0.0"
  }
}`

  const bashContent = `#!/bin/bash
# Build script for claude-code-sessions

echo "Starting build..."

# Clean previous build
rm -rf dist/

# Install dependencies
pnpm install

# Run type check
pnpm typecheck

# Build packages
pnpm build

# Run tests
pnpm test

echo "Build complete!"`
</script>

<Story name="Short Content (No Expand)" args={{ content: shortContent, maxLines: 10 }}>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-2xl">
      <ExpandableContent {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Long Content (Expandable)" args={{ content: longContent, maxLines: 5 }}>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-2xl">
      <ExpandableContent {...args} />
    </div>
  {/snippet}
</Story>

<Story
  name="JSON with Syntax Highlighting"
  args={{ content: jsonContent, lang: 'json', maxLines: 8 }}
>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-2xl">
      <ExpandableContent {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Bash Script" args={{ content: bashContent, lang: 'bash', maxLines: 6 }}>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-2xl">
      <ExpandableContent {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Custom Max Lines" args={{ content: longContent, maxLines: 3 }}>
  {#snippet children(args)}
    <div class="bg-gh-canvas p-4 rounded-lg max-w-2xl">
      <ExpandableContent {...args} />
    </div>
  {/snippet}
</Story>
