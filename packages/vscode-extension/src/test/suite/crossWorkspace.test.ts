import * as assert from 'assert'
import {
  decideResume,
  ensureClaudeCodeExtension,
  matchesAnyWorkspaceFolder,
  normalizeWorkspacePath,
  type ClaudeExtensionLike,
  type DefaultTerminalMode,
  type EnsureClaudeCodeExtensionDeps,
  type ResumeDecision,
  type WorkspaceFolderLike,
} from '../../lib/crossWorkspace'

// Pure-function unit tests for the resume-mode decision flow. Runs inside the
// standard `pnpm test` electron host alongside integration suites — same
// runner, same convention, single CI signal. No vscode API is touched, so the
// failure surface is the logic alone (not the IDE harness).
//
// Discussion #159 — 3-way picker (Internal / External / Claude Code Extension).
// The user explicitly asked for three named scenarios to be locked down with
// dedicated tests: 2-option picker, 3-option picker, direct anthropic open.
suite('crossWorkspace Suite', () => {
  const folder = (fsPath: string): WorkspaceFolderLike => ({ uri: { fsPath } })

  suite('normalizeWorkspacePath', () => {
    test('lowercases and converts backslashes', () => {
      assert.strictEqual(normalizeWorkspacePath('C:\\Users\\A\\Project'), 'c:/users/a/project')
    })

    test('leaves an already-normalized posix path unchanged (modulo case)', () => {
      assert.strictEqual(normalizeWorkspacePath('/users/a/project'), '/users/a/project')
    })

    test('empty string stays empty', () => {
      assert.strictEqual(normalizeWorkspacePath(''), '')
    })

    test('trims a trailing separator so both comparands canonicalize equal', () => {
      assert.strictEqual(normalizeWorkspacePath('/users/a/project/'), '/users/a/project')
      assert.strictEqual(
        normalizeWorkspacePath('/users/a/project/'),
        normalizeWorkspacePath('/users/a/project')
      )
    })

    test('trims repeated trailing separators (backslash form included)', () => {
      assert.strictEqual(normalizeWorkspacePath('/users/a/project///'), '/users/a/project')
      assert.strictEqual(normalizeWorkspacePath('C:\\Users\\A\\Project\\'), 'c:/users/a/project')
    })

    test('filesystem roots stay equality-consistent', () => {
      // "/" is kept as-is (the separator IS the path)
      assert.strictEqual(normalizeWorkspacePath('/'), '/')
      // "C:\" trims to "c:" — fine for equality because both sides normalize
      assert.strictEqual(normalizeWorkspacePath('C:\\'), normalizeWorkspacePath('c:/'))
    })

    test('trailing-slash cwd matches a clean workspace folder end-to-end', () => {
      assert.strictEqual(
        matchesAnyWorkspaceFolder('/users/a/project/', [folder('/users/a/project')]),
        true
      )
      assert.strictEqual(
        matchesAnyWorkspaceFolder('/users/a/project', [folder('/users/a/project/')]),
        true
      )
    })
  })

  suite('matchesAnyWorkspaceFolder', () => {
    test('null cwd never matches', () => {
      assert.strictEqual(matchesAnyWorkspaceFolder(null, [folder('/a')]), false)
    })

    test('undefined cwd never matches', () => {
      assert.strictEqual(matchesAnyWorkspaceFolder(undefined, [folder('/a')]), false)
    })

    test('empty cwd never matches', () => {
      assert.strictEqual(matchesAnyWorkspaceFolder('', [folder('/a')]), false)
    })

    test('empty folders never matches', () => {
      assert.strictEqual(matchesAnyWorkspaceFolder('/a', []), false)
    })

    test('exact path match returns true', () => {
      assert.strictEqual(
        matchesAnyWorkspaceFolder('/users/a/project', [folder('/users/a/project')]),
        true
      )
    })

    test('case-insensitive match (Windows drive letter)', () => {
      assert.strictEqual(
        matchesAnyWorkspaceFolder('C:\\Users\\A\\Project', [folder('c:/users/a/project')]),
        true
      )
    })

    test('multi-root: returns true ONLY when folders[0] matches (active workspace)', () => {
      assert.strictEqual(
        matchesAnyWorkspaceFolder('/users/a/project', [
          folder('/users/a/project'),
          folder('/users/a/other'),
        ]),
        true
      )
    })

    test('multi-root: returns false when folders[1+] matches but folders[0] does not (anthropic cannot resolve)', () => {
      assert.strictEqual(
        matchesAnyWorkspaceFolder('/users/a/project', [
          folder('/users/a/other'),
          folder('/users/a/project'),
        ]),
        false
      )
    })

    test('multi-root: returns false when no folder matches', () => {
      assert.strictEqual(
        matchesAnyWorkspaceFolder('/users/a/project', [
          folder('/users/a/other'),
          folder('/users/a/yet-another'),
        ]),
        false
      )
    })
  })

  // The three user-requested scenarios. Each owns its own suite so a failure
  // in one path is named explicitly in the test report — no opaque single
  // failure that conflates picker shape with direct-open dispatch.
  suite('decideResume — scenario A: 2-option picker (cross-workspace, ask)', () => {
    test('cross-workspace + defaultMode=ask → picker with 2 options', () => {
      const decision: ResumeDecision = decideResume({
        defaultMode: 'ask',
        cwd: '/users/a/project',
        folders: [folder('/users/a/other')],
      })
      assert.deepStrictEqual(decision, {
        kind: 'picker',
        options: ['internal', 'external'],
      })
    })

    test('no folders open (cross) + defaultMode=ask → picker with 2 options', () => {
      const decision = decideResume({
        defaultMode: 'ask',
        cwd: '/users/a/project',
        folders: [],
      })
      assert.deepStrictEqual(decision, {
        kind: 'picker',
        options: ['internal', 'external'],
      })
    })

    test('cwd null (cross) + defaultMode=ask → picker with 2 options', () => {
      const decision = decideResume({
        defaultMode: 'ask',
        cwd: null,
        folders: [folder('/users/a/project')],
      })
      assert.deepStrictEqual(decision, {
        kind: 'picker',
        options: ['internal', 'external'],
      })
    })
  })

  suite('decideResume — scenario B: 3-option picker (same-workspace, ask)', () => {
    test('same-workspace + defaultMode=ask → picker with 3 options', () => {
      const decision = decideResume({
        defaultMode: 'ask',
        cwd: '/users/a/project',
        folders: [folder('/users/a/project')],
      })
      assert.deepStrictEqual(decision, {
        kind: 'picker',
        options: ['internal', 'external', 'anthropic'],
      })
    })

    test('multi-root folders[0]-matches + defaultMode=ask → picker with 3 options', () => {
      const decision = decideResume({
        defaultMode: 'ask',
        cwd: '/users/a/project',
        folders: [folder('/users/a/project'), folder('/users/a/other')],
      })
      assert.deepStrictEqual(decision, {
        kind: 'picker',
        options: ['internal', 'external', 'anthropic'],
      })
    })

    test('multi-root folders[1+]-matches-but-folders[0]-does-not + defaultMode=ask → picker with 2 options (cross)', () => {
      const decision = decideResume({
        defaultMode: 'ask',
        cwd: '/users/a/project',
        folders: [folder('/users/a/other'), folder('/users/a/project')],
      })
      assert.deepStrictEqual(decision, {
        kind: 'picker',
        options: ['internal', 'external'],
      })
    })
  })

  suite('decideResume — scenario C: direct anthropic open (no picker)', () => {
    test('same-workspace + defaultMode=anthropic → direct anthropic open (no picker)', () => {
      const decision = decideResume({
        defaultMode: 'anthropic',
        cwd: '/users/a/project',
        folders: [folder('/users/a/project')],
      })
      assert.deepStrictEqual(decision, { kind: 'direct', mode: 'anthropic' })
    })

    test('Windows case-mismatched same-workspace + defaultMode=anthropic → direct anthropic', () => {
      const decision = decideResume({
        defaultMode: 'anthropic',
        cwd: 'C:\\Users\\A\\Project',
        folders: [folder('c:/users/a/project')],
      })
      assert.deepStrictEqual(decision, { kind: 'direct', mode: 'anthropic' })
    })
  })

  suite('decideResume — bonus: cross-workspace + defaultMode=anthropic → fallback picker', () => {
    test('cross-workspace + defaultMode=anthropic → fallback picker (2 options)', () => {
      const decision = decideResume({
        defaultMode: 'anthropic',
        cwd: '/users/a/project',
        folders: [folder('/users/a/other')],
      })
      assert.deepStrictEqual(decision, {
        kind: 'fallback-picker',
        options: ['internal', 'external'],
        reason: 'cross-workspace',
      })
    })
  })

  suite('decideResume — direct internal / external (defaultMode skips picker)', () => {
    const internalSameWorkspace: ResumeDecision = {
      kind: 'direct',
      mode: 'internal',
    }
    const externalSameWorkspace: ResumeDecision = {
      kind: 'direct',
      mode: 'external',
    }

    test('defaultMode=internal + same-workspace → direct internal', () => {
      assert.deepStrictEqual(
        decideResume({
          defaultMode: 'internal',
          cwd: '/users/a/project',
          folders: [folder('/users/a/project')],
        }),
        internalSameWorkspace
      )
    })

    test('defaultMode=internal + cross-workspace → direct internal (terminal modes never care about cwd match)', () => {
      assert.deepStrictEqual(
        decideResume({
          defaultMode: 'internal',
          cwd: '/users/a/project',
          folders: [folder('/users/a/other')],
        }),
        internalSameWorkspace
      )
    })

    test('defaultMode=external + same-workspace → direct external', () => {
      assert.deepStrictEqual(
        decideResume({
          defaultMode: 'external',
          cwd: '/users/a/project',
          folders: [folder('/users/a/project')],
        }),
        externalSameWorkspace
      )
    })

    test('defaultMode=external + cross-workspace → direct external', () => {
      assert.deepStrictEqual(
        decideResume({
          defaultMode: 'external',
          cwd: '/users/a/project',
          folders: [folder('/users/a/other')],
        }),
        externalSameWorkspace
      )
    })
  })

  // The two invariants below are stronger than any individual scenario test:
  // they enumerate every possible defaultMode value and assert that no input
  // combination can ever route a cross-workspace session to a direct anthropic
  // dispatch or to a picker that even offers anthropic as an option. If a
  // future refactor introduces a regression (e.g., dropping the cross-workspace
  // check in `decideResume`), these tests fail loudly.
  suite('decideResume — INVARIANTS (cross-workspace never reaches anthropic)', () => {
    const crossFolders = [folder('/users/a/other')]
    const sessionCwd = '/users/a/project'
    const allDefaultModes: DefaultTerminalMode[] = ['ask', 'internal', 'external', 'anthropic']

    test('INVARIANT 1 — cross-workspace + ANY defaultMode → never dispatches anthropic directly (would load empty session)', () => {
      for (const defaultMode of allDefaultModes) {
        const decision = decideResume({ defaultMode, cwd: sessionCwd, folders: crossFolders })
        if (decision.kind === 'direct') {
          assert.notStrictEqual(
            decision.mode,
            'anthropic',
            `REGRESSION: defaultMode='${defaultMode}' + cross-workspace produced { kind: 'direct', mode: 'anthropic' }. ` +
              `This would call vscode://anthropic.claude-code/open?session=... whose handler resolves against the active workspace cwd ` +
              `(which does NOT match this session) → empty session opens.`
          )
        }
      }
    })

    test('INVARIANT 2 — cross-workspace + ANY defaultMode → picker options never include anthropic (user cannot opt into empty session)', () => {
      for (const defaultMode of allDefaultModes) {
        const decision = decideResume({ defaultMode, cwd: sessionCwd, folders: crossFolders })
        if (decision.kind === 'picker' || decision.kind === 'fallback-picker') {
          assert.ok(
            !decision.options.includes('anthropic'),
            `REGRESSION: defaultMode='${defaultMode}' + cross-workspace produced a picker with anthropic in options=${JSON.stringify(decision.options)}. ` +
              `User could pick anthropic and trigger an empty-session open.`
          )
        }
      }
    })

    // INVARIANT 3/4 (null cwd + empty folders) were covered transitively by
    // INVARIANT 1/2's defaultMode enumeration on top of the matchesAnyWorkspaceFolder
    // null/empty unit tests — removed as redundant.
  })
})

// Unit tests for the install-on-demand flow extracted from resumeSession's
// anthropic branch (issue 173 finding 4's follow-up: this state machine is
// unreachable via the real resumeSession command in the test-electron host,
// since no workspace folder is open there and decideResume always routes
// cross-workspace in that case — see PR #199 discussion). Mock deps exercise
// every branch deterministically, with zero real vscode API / network calls.
suite('ensureClaudeCodeExtension Suite', () => {
  const activeExt: ClaudeExtensionLike = { isActive: true, activate: () => Promise.resolve() }

  const makeDeps = (overrides: Partial<EnsureClaudeCodeExtensionDeps> = {}) => {
    const calls = {
      showWarningMessage: 0,
      installExtension: 0,
      showInformationMessage: 0,
      showErrorMessage: 0,
    }
    const deps: EnsureClaudeCodeExtensionDeps = {
      getExtension: () => activeExt,
      showWarningMessage: () => {
        calls.showWarningMessage++
        return Promise.resolve('Install')
      },
      installExtension: () => {
        calls.installExtension++
        return Promise.resolve()
      },
      showInformationMessage: () => {
        calls.showInformationMessage++
      },
      showErrorMessage: () => {
        calls.showErrorMessage++
      },
      ...overrides,
    }
    return { deps, calls }
  }

  test('already installed and active — ready with zero prompts, zero install calls', async () => {
    const { deps, calls } = makeDeps()
    const result = await ensureClaudeCodeExtension(deps)

    assert.strictEqual(result.kind, 'ready')
    assert.strictEqual(calls.showWarningMessage, 0)
    assert.strictEqual(calls.installExtension, 0)
  })

  test('not installed + user picks Install + extension appears immediately — auto-continues to ready in one call, zero manual re-trigger', async () => {
    let installed = false
    const { deps, calls } = makeDeps({
      getExtension: () => (installed ? activeExt : undefined),
      installExtension: () => {
        calls.installExtension++
        installed = true
        return Promise.resolve()
      },
    })

    const result = await ensureClaudeCodeExtension(deps)

    assert.strictEqual(result.kind, 'ready', 'must resolve to ready within the single call')
    assert.strictEqual(calls.installExtension, 1)
    assert.strictEqual(
      calls.showInformationMessage,
      0,
      'the re-trigger info message must NOT fire when auto-continue succeeds'
    )
  })

  test('not installed + user picks Cancel — declined, no install attempted', async () => {
    const { deps, calls } = makeDeps({
      getExtension: () => undefined,
      showWarningMessage: () => {
        calls.showWarningMessage++
        return Promise.resolve('Cancel')
      },
    })

    const result = await ensureClaudeCodeExtension(deps)

    assert.strictEqual(result.kind, 'declined')
    assert.strictEqual(calls.installExtension, 0)
  })

  test('not installed + dismissed (no choice) — declined, same as Cancel', async () => {
    const { deps, calls } = makeDeps({
      getExtension: () => undefined,
      showWarningMessage: () => {
        calls.showWarningMessage++
        return Promise.resolve(undefined)
      },
    })

    const result = await ensureClaudeCodeExtension(deps)

    assert.strictEqual(result.kind, 'declined')
    assert.strictEqual(calls.installExtension, 0)
  })

  test('installed but extension host has not surfaced it yet — install-pending, info message shown once, no throw', async () => {
    const { deps, calls } = makeDeps({
      getExtension: () => undefined, // never appears, even after "install"
    })

    const result = await ensureClaudeCodeExtension(deps)

    assert.strictEqual(result.kind, 'install-pending')
    assert.strictEqual(calls.installExtension, 1)
    assert.strictEqual(
      calls.showInformationMessage,
      1,
      'must tell the user to re-trigger — this is the one legitimate manual-retry case'
    )
  })

  test('installed-but-disabled — activation runs before ready (PR #172 Internal Code Review #2 regression guard)', async () => {
    let activateCalls = 0
    const disabledExt: ClaudeExtensionLike = {
      isActive: false,
      activate: () => {
        activateCalls++
        return Promise.resolve()
      },
    }
    const { deps } = makeDeps({ getExtension: () => disabledExt })

    const result = await ensureClaudeCodeExtension(deps)

    assert.strictEqual(result.kind, 'ready')
    assert.strictEqual(activateCalls, 1, 'activate() must run when isActive is false')
  })

  test('activation throws — activation-failed with the error message, error surfaced', async () => {
    const failingExt: ClaudeExtensionLike = {
      isActive: false,
      activate: () => Promise.reject(new Error('activation boom')),
    }
    const { deps, calls } = makeDeps({ getExtension: () => failingExt })

    const result = await ensureClaudeCodeExtension(deps)

    assert.strictEqual(result.kind, 'activation-failed')
    if (result.kind === 'activation-failed') {
      assert.strictEqual(result.error, 'activation boom')
    }
    assert.strictEqual(calls.showErrorMessage, 1)
  })
})
