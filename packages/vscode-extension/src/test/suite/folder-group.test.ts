import * as assert from 'assert'
import { ensureExtensionActive } from './helpers'

// Core is ESM — use dynamic import (matches the pattern used by other suites).
async function importCore() {
  return await import('@claude-sessions/core')
}

suite('Folder-grouped View (Issue #152)', () => {
  test('groupProjects flattens single-child subtrees into path-collapsed leaves', async function () {
    await ensureExtensionActive(this)

    const core = await importCore()

    const projects = [
      {
        name: '-home-user-ghq-github-com-es6kr-claude-code-sessions',
        displayName: '~/ghq/github.com/es6kr/claude-code-sessions',
        path: '/sessions/a',
        sessionCount: 1,
      },
    ]
    const tree = core.groupProjects(projects)
    assert.strictEqual(tree.length, 1)
    assert.strictEqual(tree[0].kind, 'project')
    if (tree[0].kind === 'project') {
      assert.strictEqual(tree[0].collapsedPath, '~/ghq/github.com/es6kr/claude-code-sessions')
    }
  })

  test('groupProjects builds a group node for projects sharing a prefix', async function () {
    await ensureExtensionActive(this)

    const core = await importCore()

    const projects = [
      {
        name: '-home-user-ghq-github-com-es6kr-a',
        displayName: '~/ghq/github.com/es6kr/a',
        path: '/sessions/a',
        sessionCount: 2,
      },
      {
        name: '-home-user-ghq-github-com-es6kr-b',
        displayName: '~/ghq/github.com/es6kr/b',
        path: '/sessions/b',
        sessionCount: 3,
      },
    ]
    const tree = core.groupProjects(projects)
    assert.strictEqual(tree.length, 1)
    assert.strictEqual(tree[0].kind, 'group')
    if (tree[0].kind === 'group') {
      assert.strictEqual(tree[0].name, '~/ghq/github.com/es6kr')
      assert.strictEqual(tree[0].displayName, 'es6kr')
      assert.strictEqual(tree[0].totalSessions, 5)
      assert.strictEqual(tree[0].children.length, 2)
    }
  })

  test('groupProjects honors a custom minGroupSize', async function () {
    await ensureExtensionActive(this)

    const core = await importCore()

    const projects = [
      {
        name: '-home-user-ghq-github-com-es6kr-a',
        displayName: '~/ghq/github.com/es6kr/a',
        path: '/sessions/a',
        sessionCount: 1,
      },
      {
        name: '-home-user-ghq-github-com-es6kr-b',
        displayName: '~/ghq/github.com/es6kr/b',
        path: '/sessions/b',
        sessionCount: 1,
      },
    ]
    // With minGroupSize=3, the two leaves auto-flatten instead of forming a group.
    const tree = core.groupProjects(projects, { minGroupSize: 3 })
    assert.strictEqual(tree.length, 2)
    for (const node of tree) {
      assert.strictEqual(node.kind, 'project')
    }
  })
})
