import { describe, it, expect } from 'vitest'
import { getTodoIcon, generateTreeNodeId, parseTreeNodeId, TREE_ICONS } from '../tree-constants.js'

describe('getTodoIcon', () => {
  it('should return completed icon with green color', () => {
    const icon = getTodoIcon('completed')
    expect(icon.codicon).toBe('pass-filled')
    expect(icon.emoji).toBe('✅')
    expect(icon.color).toBe('green')
  })

  it('should return in_progress icon with yellow color', () => {
    const icon = getTodoIcon('in_progress')
    expect(icon.codicon).toBe('sync~spin')
    expect(icon.emoji).toBe('🔄')
    expect(icon.color).toBe('yellow')
  })

  it('should return pending icon without color', () => {
    const icon = getTodoIcon('pending')
    expect(icon.codicon).toBe('circle-outline')
    expect(icon.emoji).toBe('⭕')
    expect(icon.color).toBeUndefined()
  })

  it('should return the same reference as TREE_ICONS.todo', () => {
    expect(getTodoIcon('completed')).toBe(TREE_ICONS.todo.completed)
    expect(getTodoIcon('in_progress')).toBe(TREE_ICONS.todo.in_progress)
    expect(getTodoIcon('pending')).toBe(TREE_ICONS.todo.pending)
  })
})

describe('generateTreeNodeId', () => {
  it('should generate basic session node ID', () => {
    const id = generateTreeNodeId('session', 'my-project', 'session-123')
    expect(id).toBe('session:my-project:session-123')
  })

  it('should generate project node ID', () => {
    const id = generateTreeNodeId('project', 'my-project', 'root')
    expect(id).toBe('project:my-project:root')
  })

  it('should include agentId when provided', () => {
    const id = generateTreeNodeId('agent', 'my-project', 'session-123', 'agent-456')
    expect(id).toBe('agent:my-project:session-123:agent-456')
  })

  it('should include itemIndex when provided', () => {
    const id = generateTreeNodeId('todo', 'my-project', 'session-123', 'agent-456', 0)
    expect(id).toBe('todo:my-project:session-123:agent-456:0')
  })

  it('should include itemIndex even without agentId', () => {
    const id = generateTreeNodeId('summary', 'my-project', 'session-123', undefined, 5)
    expect(id).toBe('summary:my-project:session-123:5')
  })

  it('should handle special characters in project names', () => {
    const id = generateTreeNodeId('session', '-Users-david-projects', 'session-abc')
    expect(id).toBe('session:-Users-david-projects:session-abc')
  })
})

describe('parseTreeNodeId', () => {
  it('should parse basic session node ID', () => {
    const result = parseTreeNodeId('session:my-project:session-123')
    expect(result).toEqual({
      type: 'session',
      projectName: 'my-project',
      sessionId: 'session-123',
    })
  })

  it('should parse node ID with agentId', () => {
    const result = parseTreeNodeId('agent:my-project:session-123:agent-456')
    expect(result).toEqual({
      type: 'agent',
      projectName: 'my-project',
      sessionId: 'session-123',
      agentId: 'agent-456',
    })
  })

  it('should parse node ID with agentId and itemIndex', () => {
    const result = parseTreeNodeId('todo:my-project:session-123:agent-456:0')
    expect(result).toEqual({
      type: 'todo',
      projectName: 'my-project',
      sessionId: 'session-123',
      agentId: 'agent-456',
      itemIndex: 0,
    })
  })

  it('should return null for invalid ID with fewer than 3 parts', () => {
    expect(parseTreeNodeId('session:my-project')).toBeNull()
    expect(parseTreeNodeId('session')).toBeNull()
    expect(parseTreeNodeId('')).toBeNull()
  })

  it('should roundtrip with generateTreeNodeId', () => {
    const original = {
      type: 'todo' as const,
      projectName: 'proj',
      sessionId: 'sess',
      agentId: 'ag',
      itemIndex: 3,
    }
    const id = generateTreeNodeId(
      original.type,
      original.projectName,
      original.sessionId,
      original.agentId,
      original.itemIndex
    )
    const parsed = parseTreeNodeId(id)
    expect(parsed).toEqual(original)
  })

  it('should handle non-numeric itemIndex gracefully', () => {
    const result = parseTreeNodeId('todo:proj:sess:agent:notanumber')
    expect(result).toEqual({
      type: 'todo',
      projectName: 'proj',
      sessionId: 'sess',
      agentId: 'agent',
    })
  })
})
