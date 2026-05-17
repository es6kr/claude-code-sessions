import { mount } from 'svelte'
import App, { type TimelineEntry } from './App.svelte'
import './app.css'

type ExtToWebview = {
  type: 'load-session'
  filePath: string
  content: string
}

type WebviewToExt = { type: 'ready' }

interface VsCodeApi {
  postMessage(msg: WebviewToExt): void
}

declare function acquireVsCodeApi(): VsCodeApi

const TEXT_PREVIEW_LIMIT = 800

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const b = block as Record<string, unknown>
    if (b.type === 'text' && typeof b.text === 'string') {
      parts.push(b.text)
    } else if (b.type === 'tool_use') {
      const name = typeof b.name === 'string' ? b.name : 'tool'
      const input = b.input ? JSON.stringify(b.input) : ''
      parts.push(`[${name}] ${input}`)
    } else if (b.type === 'tool_result') {
      const inner = (b as { content?: unknown }).content
      parts.push(extractText(inner) || '[tool_result]')
    } else if (b.type === 'image') {
      parts.push('[image]')
    }
  }
  return parts.join('\n').trim()
}

function truncate(s: string): string {
  if (s.length <= TEXT_PREVIEW_LIMIT) return s
  return s.slice(0, TEXT_PREVIEW_LIMIT) + '…'
}

function parseLine(line: string, index: number): TimelineEntry | null {
  let record: Record<string, unknown>
  try {
    record = JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
  const type = typeof record.type === 'string' ? record.type : 'unknown'
  const timestamp = typeof record.timestamp === 'string' ? record.timestamp : undefined

  let role: string | undefined
  let text = ''
  let ideTag: string | undefined

  switch (type) {
    case 'user':
    case 'assistant': {
      const message = record.message as Record<string, unknown> | undefined
      if (message) {
        role = typeof message.role === 'string' ? message.role : undefined
        text = extractText(message.content)
      }
      break
    }
    case 'summary': {
      text = typeof record.summary === 'string' ? record.summary : ''
      break
    }
    case 'custom-title': {
      text = typeof record.customTitle === 'string' ? record.customTitle : ''
      break
    }
    case 'agent-name': {
      text = typeof record.agentName === 'string' ? record.agentName : ''
      break
    }
    case 'system': {
      text = typeof record.content === 'string' ? record.content : ''
      break
    }
    default: {
      if (typeof type === 'string' && type.startsWith('ide_')) {
        ideTag = type
        text = typeof record.content === 'string' ? record.content : ''
      } else {
        text = ''
      }
    }
  }

  return {
    index,
    timestamp,
    type,
    role,
    text: truncate(text),
    ideTag,
  }
}

function buildEntries(content: string): { entries: TimelineEntry[]; parseErrors: number } {
  const lines = content.split('\n')
  const entries: TimelineEntry[] = []
  let parseErrors = 0
  let index = 0
  for (const line of lines) {
    if (!line.trim()) continue
    const entry = parseLine(line, index)
    if (entry) {
      entries.push(entry)
      index += 1
    } else {
      parseErrors += 1
    }
  }
  return { entries, parseErrors }
}

const vscode = acquireVsCodeApi()

const target = document.getElementById('app')
if (!target) {
  throw new Error('Webview root element #app not found')
}

const appProps = $state({
  filePath: '',
  entries: [] as TimelineEntry[],
  parseErrors: 0,
})

mount(App, {
  target,
  props: appProps,
})

window.addEventListener('message', (event) => {
  const msg = event.data as ExtToWebview
  if (msg?.type === 'load-session') {
    appProps.filePath = msg.filePath
    const { entries, parseErrors } = buildEntries(msg.content)
    appProps.entries = entries
    appProps.parseErrors = parseErrors
  }
})

vscode.postMessage({ type: 'ready' })
