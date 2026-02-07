/**
 * Session analysis, compression, and knowledge extraction
 */
import { Effect } from 'effect'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getSessionsDir } from '../paths.js'
import type {
  CompressSessionOptions,
  CompressSessionResult,
  ContentItem,
  ConversationLine,
  Message,
  ProjectKnowledge,
  SessionAnalysis,
  SummarizeSessionOptions,
  SummarizeSessionResult,
} from '../types.js'
import { extractTextContent, parseJsonlLines } from '../utils.js'
import { readSession } from './crud.js'
import { repairParentUuidChain } from './validation.js'

// Helper: Check if item is a tool_use content item
const isToolUse = (
  item: unknown
): item is { type: 'tool_use'; name?: string; id?: string; input?: { file_path?: string } } =>
  item !== null &&
  typeof item === 'object' &&
  'type' in item &&
  (item as ContentItem).type === 'tool_use'

// Helper: Check if item is a tool_result with error
const isToolResultError = (
  item: unknown
): item is { type: 'tool_result'; tool_use_id?: string; is_error: true } =>
  item !== null &&
  typeof item === 'object' &&
  'type' in item &&
  (item as ContentItem).type === 'tool_result' &&
  'is_error' in item &&
  (item as { is_error?: boolean }).is_error === true

// Helper: Find tool_use by ID across all messages
const findToolUseById = (messages: Message[], toolUseId: string): string | null => {
  for (const msg of messages) {
    const content = msg.message?.content
    if (!Array.isArray(content)) continue
    for (const item of content) {
      if (isToolUse(item) && item.id === toolUseId) {
        return item.name ?? 'unknown'
      }
    }
  }
  return null
}

// Analyze session for optimization insights
export const analyzeSession = (projectName: string, sessionId: string) =>
  Effect.gen(function* () {
    const messages = yield* readSession(projectName, sessionId)

    // Initialize counters
    let userMessages = 0
    let assistantMessages = 0
    let summaryCount = 0
    let snapshotCount = 0
    const toolUsageMap = new Map<string, { count: number; errorCount: number }>()
    const filesChanged = new Set<string>()
    const patterns: { type: string; description: string; count: number }[] = []
    const milestones: { timestamp?: string; description: string; messageUuid?: string }[] = []

    // Track timestamps for duration
    let firstTimestamp: string | undefined
    let lastTimestamp: string | undefined

    for (const msg of messages) {
      // Track timestamps
      if (msg.timestamp) {
        if (!firstTimestamp) firstTimestamp = msg.timestamp
        lastTimestamp = msg.timestamp
      }

      // Count message types
      if (msg.type === 'user') {
        userMessages++
        // Check for milestone indicators in user messages
        const content = typeof msg.content === 'string' ? msg.content : ''
        if (content.toLowerCase().includes('commit') || content.toLowerCase().includes('완료')) {
          milestones.push({
            timestamp: msg.timestamp,
            description: `User checkpoint: ${content.slice(0, 50)}...`,
            messageUuid: msg.uuid,
          })
        }
      } else if (msg.type === 'assistant') {
        assistantMessages++

        // Track tool usage
        const content = msg.message?.content
        if (!Array.isArray(content)) continue
        for (const item of content) {
          if (!isToolUse(item)) continue
          const toolName = item.name ?? 'unknown'
          const existing = toolUsageMap.get(toolName) ?? { count: 0, errorCount: 0 }
          existing.count++
          toolUsageMap.set(toolName, existing)

          // Track file changes
          if ((toolName === 'Write' || toolName === 'Edit') && item.input?.file_path) {
            filesChanged.add(item.input.file_path)
          }
        }
      } else if (msg.type === 'summary') {
        summaryCount++
        // Extract milestone from summary
        if (msg.summary) {
          milestones.push({
            timestamp: msg.timestamp,
            description: `Summary: ${msg.summary.slice(0, 100)}...`,
            messageUuid: msg.uuid,
          })
        }
      } else if (msg.type === 'file-history-snapshot') {
        snapshotCount++
        // Track files from snapshots
        const snapshot = msg as unknown as {
          snapshot?: { trackedFileBackups?: Record<string, unknown> }
        }
        if (snapshot.snapshot?.trackedFileBackups) {
          for (const filePath of Object.keys(snapshot.snapshot.trackedFileBackups)) {
            filesChanged.add(filePath)
          }
        }
      }
    }

    // Track tool errors from tool_result messages
    for (const msg of messages) {
      if (msg.type !== 'user' || !Array.isArray(msg.content)) continue
      for (const item of msg.content) {
        if (!isToolResultError(item) || !item.tool_use_id) continue
        const toolName = findToolUseById(messages, item.tool_use_id)
        if (!toolName) continue
        const existing = toolUsageMap.get(toolName)
        if (existing) existing.errorCount++
      }
    }

    // Calculate duration
    let durationMinutes = 0
    if (firstTimestamp && lastTimestamp) {
      const first = new Date(firstTimestamp).getTime()
      const last = new Date(lastTimestamp).getTime()
      durationMinutes = Math.round((last - first) / 1000 / 60)
    }

    // Detect patterns
    const toolUsageArray = Array.from(toolUsageMap.entries()).map(([name, stats]) => ({
      name,
      count: stats.count,
      errorCount: stats.errorCount,
    }))

    // Pattern: High error rate
    for (const tool of toolUsageArray) {
      if (tool.count >= 3 && tool.errorCount / tool.count > 0.3) {
        patterns.push({
          type: 'high_error_rate',
          description: `${tool.name} had ${tool.errorCount}/${tool.count} errors (${Math.round((tool.errorCount / tool.count) * 100)}%)`,
          count: tool.errorCount,
        })
      }
    }

    // Pattern: Many snapshots (potential for compression)
    if (snapshotCount > 10) {
      patterns.push({
        type: 'many_snapshots',
        description: `${snapshotCount} file-history-snapshots could be compressed`,
        count: snapshotCount,
      })
    }

    return {
      sessionId,
      projectName,
      durationMinutes,
      stats: {
        totalMessages: messages.length,
        userMessages,
        assistantMessages,
        summaryCount,
        snapshotCount,
      },
      toolUsage: toolUsageArray.sort((a, b) => b.count - a.count),
      filesChanged: Array.from(filesChanged),
      patterns,
      milestones,
    } satisfies SessionAnalysis
  })

// Compress session by removing snapshots and truncating tool outputs
export const compressSession = (
  projectName: string,
  sessionId: string,
  options: CompressSessionOptions = {}
) =>
  Effect.gen(function* () {
    const { keepSnapshots = 'first_last', maxToolOutputLength = 5000 } = options
    const filePath = path.join(getSessionsDir(), projectName, `${sessionId}.jsonl`)

    // Read original file
    const content = yield* Effect.tryPromise(() => fs.readFile(filePath, 'utf-8'))
    const originalSize = Buffer.byteLength(content, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const messages = parseJsonlLines<Record<string, unknown>>(lines, filePath)

    let removedCustomTitles = 0
    let removedProgress = 0
    let removedSnapshots = 0
    let truncatedOutputs = 0

    // Find snapshot indices and custom-title indices
    const customTitleIndices: number[] = []
    const snapshotIndices: number[] = []
    messages.forEach((msg, idx) => {
      if (msg.type === 'custom-title') {
        customTitleIndices.push(idx)
      }
      if (msg.type === 'file-history-snapshot') {
        snapshotIndices.push(idx)
      }
    })

    // Collect messages to remove
    const messagesToRemove: Record<string, unknown>[] = []

    // Filter messages based on keepSnapshots option, remove progress and duplicate custom-titles
    const filteredMessages = messages.filter((msg, idx) => {
      // Always remove progress messages (hook progress, etc.)
      if (msg.type === 'progress') {
        removedProgress++
        messagesToRemove.push(msg)
        return false
      }

      // Keep only the last custom-title record
      if (msg.type === 'custom-title') {
        if (
          customTitleIndices.length > 1 &&
          idx !== customTitleIndices[customTitleIndices.length - 1]
        ) {
          removedCustomTitles++
          messagesToRemove.push(msg)
          return false
        }
      }

      if (msg.type === 'file-history-snapshot') {
        if (keepSnapshots === 'none') {
          removedSnapshots++
          messagesToRemove.push(msg)
          return false
        }
        if (keepSnapshots === 'first_last') {
          const isFirst = idx === snapshotIndices[0]
          const isLast = idx === snapshotIndices[snapshotIndices.length - 1]
          if (!isFirst && !isLast) {
            removedSnapshots++
            messagesToRemove.push(msg)
            return false
          }
        }
      }
      return true
    })

    // Repair parentUuid chain after removing messages
    repairParentUuidChain(filteredMessages, messagesToRemove)

    // Truncate long tool outputs
    for (const msg of filteredMessages) {
      if (msg.type === 'user' && Array.isArray(msg.content)) {
        for (const item of msg.content as Array<Record<string, unknown>>) {
          if (item.type === 'tool_result' && typeof item.content === 'string') {
            if (maxToolOutputLength > 0 && item.content.length > maxToolOutputLength) {
              item.content = item.content.slice(0, maxToolOutputLength) + '\n... [truncated]'
              truncatedOutputs++
            }
          }
        }
      }
    }

    // Write compressed file
    const newContent = filteredMessages.map((m) => JSON.stringify(m)).join('\n') + '\n'
    const compressedSize = Buffer.byteLength(newContent, 'utf-8')

    yield* Effect.tryPromise(() => fs.writeFile(filePath, newContent, 'utf-8'))

    return {
      success: true,
      originalSize,
      compressedSize,
      removedCustomTitles,
      removedProgress,
      removedSnapshots,
      truncatedOutputs,
    } satisfies CompressSessionResult
  })

// Extract knowledge from multiple sessions in a project
export const extractProjectKnowledge = (projectName: string, sessionIds?: string[]) =>
  Effect.gen(function* () {
    const sessionsDir = getSessionsDir()
    const projectDir = path.join(sessionsDir, projectName)

    // Get all session files if not specified
    let targetSessionIds = sessionIds
    if (!targetSessionIds) {
      const files = yield* Effect.tryPromise(() => fs.readdir(projectDir))
      targetSessionIds = files
        .filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'))
        .map((f) => f.replace('.jsonl', ''))
    }

    // Aggregate data across sessions
    const fileModifyCount = new Map<string, { count: number; lastModified?: string }>()
    const toolSequences: string[][] = []
    const decisions: { context: string; decision: string; sessionId: string }[] = []

    for (const sessionId of targetSessionIds) {
      try {
        const messages = yield* readSession(projectName, sessionId)

        // Track file modifications
        for (const msg of messages) {
          if (msg.type === 'file-history-snapshot') {
            const snapshot = msg as unknown as {
              snapshot?: { trackedFileBackups?: Record<string, unknown>; timestamp?: string }
            }
            if (snapshot.snapshot?.trackedFileBackups) {
              for (const filePath of Object.keys(snapshot.snapshot.trackedFileBackups)) {
                const existing = fileModifyCount.get(filePath) ?? { count: 0 }
                existing.count++
                existing.lastModified = snapshot.snapshot.timestamp
                fileModifyCount.set(filePath, existing)
              }
            }
          }

          // Track tool sequences
          if (
            msg.type === 'assistant' &&
            msg.message?.content &&
            Array.isArray(msg.message.content)
          ) {
            const tools: string[] = []
            for (const item of msg.message.content) {
              if (item && typeof item === 'object' && 'type' in item && item.type === 'tool_use') {
                const toolUse = item as { name?: string }
                if (toolUse.name) tools.push(toolUse.name)
              }
            }
            if (tools.length > 1) {
              toolSequences.push(tools)
            }
          }

          // Extract decisions from summaries
          if (msg.type === 'summary' && msg.summary) {
            decisions.push({
              context: 'Session summary',
              decision: msg.summary.slice(0, 200),
              sessionId,
            })
          }
        }
      } catch {
        // Skip sessions that fail to read
        continue
      }
    }

    // Build hot files list
    const hotFiles = Array.from(fileModifyCount.entries())
      .map(([filePath, data]) => ({
        path: filePath,
        modifyCount: data.count,
        lastModified: data.lastModified,
      }))
      .sort((a, b) => b.modifyCount - a.modifyCount)
      .slice(0, 20)

    // Build workflow patterns
    const workflowMap = new Map<string, number>()
    for (const seq of toolSequences) {
      const key = seq.join(' -> ')
      workflowMap.set(key, (workflowMap.get(key) ?? 0) + 1)
    }
    const workflows = Array.from(workflowMap.entries())
      .filter(([, count]) => count >= 2)
      .map(([sequence, count]) => ({
        sequence: sequence.split(' -> '),
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      projectName,
      patterns: [],
      hotFiles,
      workflows,
      decisions: decisions.slice(0, 20),
    } satisfies ProjectKnowledge
  })

// Helper to truncate text and replace newlines
function truncateText(text: string, maxLen: number): string {
  const cleaned = text.replace(/\n/g, ' ')
  if (cleaned.length > maxLen) {
    return cleaned.slice(0, maxLen) + '...'
  }
  return cleaned
}

// Summarize session into user/assistant conversation format
export const summarizeSession = (
  projectName: string,
  sessionId: string,
  options: SummarizeSessionOptions = {}
) =>
  Effect.gen(function* () {
    const { limit = 50, maxLength = 100 } = options
    const messages = yield* readSession(projectName, sessionId)

    const lines: ConversationLine[] = []
    let count = 0

    for (const msg of messages) {
      if (count >= limit) break

      if (msg.type === 'user' || msg.type === 'human') {
        // Extract timestamp for user messages using locale-based formatting
        let timeStr: string | undefined
        if (msg.timestamp) {
          try {
            const dt = new Date(msg.timestamp)
            timeStr = dt.toLocaleString('ko-KR', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          } catch {
            // Skip timestamp on error
          }
        }

        const text = extractTextContent(msg.message)
        if (text) {
          const truncated = truncateText(text, maxLength)
          lines.push({ role: 'user', content: truncated, timestamp: timeStr })
          count++
        }
      } else if (msg.type === 'assistant') {
        const text = extractTextContent(msg.message)
        if (text) {
          const truncated = truncateText(text, maxLength)
          lines.push({ role: 'assistant', content: truncated })
          count++
        }
      }
    }

    // Build formatted string
    const formatted = lines
      .map((line) => {
        if (line.role === 'user') {
          return line.timestamp
            ? `user [${line.timestamp}]: ${line.content}`
            : `user: ${line.content}`
        }
        return `assistant: ${line.content}`
      })
      .join('\n')

    return {
      sessionId,
      projectName,
      lines,
      formatted,
    } satisfies SummarizeSessionResult
  })
