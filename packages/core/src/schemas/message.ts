/**
 * Effect Schema definitions for JSONL session message types.
 *
 * Provides runtime validation at the JSONL parsing boundary.
 * All known message types are defined as tagged structs with a `type` discriminator.
 * Unknown types fall through to `UnknownMessage` for forward compatibility.
 */
import { Schema } from 'effect'

// ============================================================================
// Individual Message Schemas
// ============================================================================

export const UserMessage = Schema.Struct({
  type: Schema.Literal('user'),
  uuid: Schema.String,
  parentUuid: Schema.optional(Schema.NullOr(Schema.String)),
  sessionId: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  message: Schema.optional(Schema.Unknown),
  content: Schema.optional(Schema.Unknown),
  toolUseResult: Schema.optional(Schema.Unknown),
  isCompactSummary: Schema.optional(Schema.Boolean),
})

export const HumanMessage = Schema.Struct({
  type: Schema.Literal('human'),
  uuid: Schema.String,
  parentUuid: Schema.optional(Schema.NullOr(Schema.String)),
  sessionId: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  message: Schema.optional(Schema.Unknown),
  content: Schema.optional(Schema.Unknown),
  toolUseResult: Schema.optional(Schema.Unknown),
})

export const AssistantMessage = Schema.Struct({
  type: Schema.Literal('assistant'),
  uuid: Schema.String,
  parentUuid: Schema.optional(Schema.NullOr(Schema.String)),
  sessionId: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  message: Schema.optional(Schema.Unknown),
  content: Schema.optional(Schema.Unknown),
  toolUseResult: Schema.optional(Schema.Unknown),
  isCompactSummary: Schema.optional(Schema.Boolean),
})

export const SummaryMessage = Schema.Struct({
  type: Schema.Literal('summary'),
  summary: Schema.String,
  leafUuid: Schema.optional(Schema.NullOr(Schema.String)),
  isCompactSummary: Schema.optional(Schema.Boolean),
})

export const CustomTitleMessage = Schema.Struct({
  type: Schema.Literal('custom-title'),
  customTitle: Schema.String,
  sessionId: Schema.optional(Schema.String),
})

export const AgentNameMessage = Schema.Struct({
  type: Schema.Literal('agent-name'),
  agentName: Schema.String,
  sessionId: Schema.optional(Schema.String),
})

export const FileHistorySnapshotMessage = Schema.Struct({
  type: Schema.Literal('file-history-snapshot'),
  snapshot: Schema.Unknown,
  messageId: Schema.optional(Schema.String),
})

export const SystemMessage = Schema.Struct({
  type: Schema.Literal('system'),
  subtype: Schema.optional(Schema.String),
  uuid: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
})

export const ProgressMessage = Schema.Struct({
  type: Schema.Literal('progress'),
  data: Schema.optional(Schema.Unknown),
})

/** Fallback for unknown/future message types — accepts any object with a `type` string */
export const UnknownMessage = Schema.Struct({
  type: Schema.String,
}).annotations({ identifier: 'UnknownMessage' })

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * Union of all known JSONL message types.
 * Schema.decodeUnknownEither validates and narrows the type at runtime.
 * Unknown types match `UnknownMessage` for forward compatibility.
 */
export const SessionMessage = Schema.Union(
  UserMessage,
  HumanMessage,
  AssistantMessage,
  SummaryMessage,
  CustomTitleMessage,
  AgentNameMessage,
  FileHistorySnapshotMessage,
  SystemMessage,
  ProgressMessage,
  UnknownMessage
)

// ============================================================================
// Inferred Types
// ============================================================================

export type UserMessage = typeof UserMessage.Type
export type HumanMessage = typeof HumanMessage.Type
export type AssistantMessage = typeof AssistantMessage.Type
export type SummaryMessage = typeof SummaryMessage.Type
export type CustomTitleMessage = typeof CustomTitleMessage.Type
export type AgentNameMessage = typeof AgentNameMessage.Type
export type FileHistorySnapshotMessage = typeof FileHistorySnapshotMessage.Type
export type SystemMessage = typeof SystemMessage.Type
export type ProgressMessage = typeof ProgressMessage.Type
export type SessionMessage = typeof SessionMessage.Type

// ============================================================================
// Validation Helpers
// ============================================================================

const decodeSessionMessage = Schema.decodeUnknownEither(SessionMessage)

/**
 * Validate a parsed JSON object against SessionMessage schema.
 * Returns the validated message or null on decode failure.
 * Logs a warning for decode failures when a logger is provided.
 */
export const validateMessage = (
  parsed: unknown,
  onWarning?: (message: string) => void
): SessionMessage | null => {
  const result = decodeSessionMessage(parsed)
  if (result._tag === 'Right') {
    return result.right
  }
  if (onWarning) {
    onWarning(`Schema validation failed: ${result.left.message}`)
  }
  return null
}

/**
 * Type guard helpers for narrowing validated SessionMessage
 */
export const isUserMessage = (msg: SessionMessage): msg is UserMessage => msg.type === 'user'

export const isHumanMessage = (msg: SessionMessage): msg is HumanMessage => msg.type === 'human'

export const isAssistantMessage = (msg: SessionMessage): msg is AssistantMessage =>
  msg.type === 'assistant'

export const isSummaryMessage = (msg: SessionMessage): msg is SummaryMessage =>
  msg.type === 'summary'

export const isCustomTitleMessage = (msg: SessionMessage): msg is CustomTitleMessage =>
  msg.type === 'custom-title'

export const isAgentNameMessage = (msg: SessionMessage): msg is AgentNameMessage =>
  msg.type === 'agent-name'

export const isFileHistorySnapshotMessage = (
  msg: SessionMessage
): msg is FileHistorySnapshotMessage => msg.type === 'file-history-snapshot'

export const isSystemMessage = (msg: SessionMessage): msg is SystemMessage => msg.type === 'system'

export const isProgressMessage = (msg: SessionMessage): msg is ProgressMessage =>
  msg.type === 'progress'
