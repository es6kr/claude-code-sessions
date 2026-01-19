import { describe, it, expect, beforeEach } from 'vitest'
import {
  configureOpenFile,
  getOpenFileConfig,
  resetOpenFileConfig,
  expandHomePath,
} from './open-file'

describe('open-file configuration', () => {
  beforeEach(() => {
    resetOpenFileConfig()
  })

  it('should have default config with code editor', () => {
    const config = getOpenFileConfig()
    expect(config.editorCommand).toBe('code')
    expect(config.homeDir).toBe('')
  })

  it('should allow configuring editor command', () => {
    configureOpenFile({ editorCommand: 'cursor' })
    const config = getOpenFileConfig()
    expect(config.editorCommand).toBe('cursor')
  })

  it('should allow configuring home directory', () => {
    configureOpenFile({ homeDir: '/Users/david' })
    const config = getOpenFileConfig()
    expect(config.homeDir).toBe('/Users/david')
  })

  it('should merge partial config', () => {
    configureOpenFile({ editorCommand: 'nvim', homeDir: '/home/user' })
    configureOpenFile({ editorCommand: 'vim' })
    const config = getOpenFileConfig()
    expect(config.editorCommand).toBe('vim')
    expect(config.homeDir).toBe('/home/user')
  })

  it('should reset to default config', () => {
    configureOpenFile({ editorCommand: 'nvim', homeDir: '/home/user' })
    resetOpenFileConfig()
    const config = getOpenFileConfig()
    expect(config.editorCommand).toBe('code')
    expect(config.homeDir).toBe('')
  })
})

describe('expandHomePath', () => {
  const homeDir = '/Users/david'

  it('should expand ~ to home directory', () => {
    expect(expandHomePath('~/.claude/sessions', homeDir)).toBe('/Users/david/.claude/sessions')
  })

  it('should expand ~ alone', () => {
    expect(expandHomePath('~', homeDir)).toBe('/Users/david')
  })

  it('should not change paths without ~', () => {
    expect(expandHomePath('/var/log/file.log', homeDir)).toBe('/var/log/file.log')
  })

  it('should not expand ~ in middle of path', () => {
    expect(expandHomePath('/some/path/~test', homeDir)).toBe('/some/path/~test')
  })

  it('should return path unchanged if homeDir is empty', () => {
    expect(expandHomePath('~/.config', '')).toBe('~/.config')
  })

  it('should handle Windows-style home directory', () => {
    const winHome = 'C:\\Users\\david'
    expect(expandHomePath('~\\.claude\\sessions', winHome)).toBe(
      'C:\\Users\\david\\.claude\\sessions'
    )
  })
})
