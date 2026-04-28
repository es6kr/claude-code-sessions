import { describe, it, expect } from 'vitest'
import {
  validateMessage,
  isUserMessage,
  isAssistantMessage,
  isCustomTitleMessage,
  isAgentNameMessage,
  isSummaryMessage,
  isFileHistorySnapshotMessage,
  isSystemMessage,
  isProgressMessage,
  isHumanMessage,
} from '../schemas/message.js'
import { parseJsonlLines } from '../utils.js'

describe('Effect Schema - SessionMessage validation', () => {
  describe('validateMessage', () => {
    it('should validate a user message', () => {
      const msg = {
        type: 'user',
        uuid: 'msg-1',
        timestamp: '2025-01-01T00:00:00Z',
        message: { role: 'user', content: 'hello' },
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('user')
      expect(isUserMessage(result!)).toBe(true)
    })

    it('should validate an assistant message', () => {
      const msg = {
        type: 'assistant',
        uuid: 'msg-2',
        parentUuid: 'msg-1',
        timestamp: '2025-01-01T00:00:01Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(isAssistantMessage(result!)).toBe(true)
    })

    it('should validate a custom-title message', () => {
      const msg = {
        type: 'custom-title',
        customTitle: 'My Session',
        sessionId: 'session-1',
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(isCustomTitleMessage(result!)).toBe(true)
      if (isCustomTitleMessage(result!)) {
        expect(result.customTitle).toBe('My Session')
      }
    })

    it('should validate an agent-name message', () => {
      const msg = {
        type: 'agent-name',
        agentName: 'Ralph Agent',
        sessionId: 'session-1',
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(isAgentNameMessage(result!)).toBe(true)
      if (isAgentNameMessage(result!)) {
        expect(result.agentName).toBe('Ralph Agent')
      }
    })

    it('should validate a summary message', () => {
      const msg = {
        type: 'summary',
        summary: 'Session recap',
        leafUuid: 'leaf-1',
        isCompactSummary: true,
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(isSummaryMessage(result!)).toBe(true)
    })

    it('should validate a file-history-snapshot message', () => {
      const msg = {
        type: 'file-history-snapshot',
        snapshot: { files: [] },
        messageId: 'msg-3',
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(isFileHistorySnapshotMessage(result!)).toBe(true)
    })

    it('should validate a system message', () => {
      const msg = {
        type: 'system',
        subtype: 'compact_boundary',
        uuid: 'sys-1',
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(isSystemMessage(result!)).toBe(true)
    })

    it('should validate a progress message', () => {
      const msg = {
        type: 'progress',
        data: { hookEvent: { type: 'start' } },
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(isProgressMessage(result!)).toBe(true)
    })

    it('should validate a human (legacy user) message', () => {
      const msg = {
        type: 'human',
        uuid: 'msg-legacy',
        message: { role: 'user', content: 'legacy format' },
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(isHumanMessage(result!)).toBe(true)
    })

    it('should accept unknown message types via fallback', () => {
      const msg = {
        type: 'future-type',
        someField: 'data',
      }
      const result = validateMessage(msg)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('future-type')
    })

    it('should return null for non-object input', () => {
      const warnings: string[] = []
      const result = validateMessage('not-an-object', (msg) => warnings.push(msg))
      expect(result).toBeNull()
      expect(warnings.length).toBeGreaterThan(0)
    })

    it('should return null for object without type field', () => {
      const warnings: string[] = []
      const result = validateMessage({ uuid: 'no-type' }, (msg) => warnings.push(msg))
      expect(result).toBeNull()
      expect(warnings.length).toBeGreaterThan(0)
    })

    it('should return null for null input', () => {
      const result = validateMessage(null)
      expect(result).toBeNull()
    })
  })

  describe('type guard functions', () => {
    it('should correctly narrow user messages', () => {
      const msg = validateMessage({ type: 'user', uuid: 'u1' })!
      expect(isUserMessage(msg)).toBe(true)
      expect(isAssistantMessage(msg)).toBe(false)
    })

    it('should correctly narrow custom-title messages', () => {
      const msg = validateMessage({ type: 'custom-title', customTitle: 'Title' })!
      expect(isCustomTitleMessage(msg)).toBe(true)
      expect(isUserMessage(msg)).toBe(false)
    })
  })

  describe('parseJsonlLines with validate option', () => {
    it('should parse without validation by default', () => {
      const lines = ['{"type":"user","uuid":"u1"}', '{"type":"custom-title","customTitle":"Test"}']
      const result = parseJsonlLines(lines, 'test.jsonl')
      expect(result).toHaveLength(2)
    })

    it('should parse with validation enabled', () => {
      const lines = ['{"type":"user","uuid":"u1"}', '{"type":"custom-title","customTitle":"Test"}']
      const result = parseJsonlLines(lines, 'test.jsonl', { validate: true })
      expect(result).toHaveLength(2)
    })

    it('should still include lines that fail schema validation', () => {
      const lines = ['{"type":"user","uuid":"u1"}', '{"noType":"invalid"}']
      // Even with validate, malformed schema lines are included (non-breaking)
      const result = parseJsonlLines(lines, 'test.jsonl', { validate: true })
      expect(result).toHaveLength(2)
    })

    it('should skip JSON parse errors regardless of validate', () => {
      const lines = ['{"type":"user","uuid":"u1"}', 'not-json']
      const result = parseJsonlLines(lines, 'test.jsonl', { validate: true })
      expect(result).toHaveLength(1)
    })
  })
})
