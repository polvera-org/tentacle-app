interface TiptapTextNode {
  type?: unknown
  text?: unknown
  content?: unknown
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectPlainText(value: unknown, parts: string[]): void {
  if (typeof value === 'string') {
    parts.push(value)
    return
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPlainText(entry, parts)
    }
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  const node = value as TiptapTextNode
  if (node.type === 'hardBreak') {
    parts.push('\n')
  }

  if (typeof node.text === 'string') {
    parts.push(node.text)
  }

  if (Array.isArray(node.content)) {
    collectPlainText(node.content, parts)
  }
}

export function extractPlainTextFromTiptapBody(body: string): string {
  const normalizedBody = normalizeString(body)
  if (normalizedBody.length === 0) {
    return ''
  }

  try {
    const parsed: unknown = JSON.parse(body.replace(/\u0000/g, ''))
    const parts: string[] = []
    collectPlainText(parsed, parts)
    const extractedText = normalizeString(parts.join(' '))
    if (extractedText.length > 0) {
      return extractedText
    }
  } catch {
    // Body is not JSON, return normalized plain text.
  }

  return normalizedBody
}
