'use client'

import { getOpenAIApiKey } from '@/lib/settings/openai-config'

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_MODEL = 'gpt-4o-mini'
const MAX_SUGGESTED_TAGS = 5
const MAX_CANDIDATE_TAGS = 100
const MAX_NOTE_TEXT_LENGTH = 4000
const REQUEST_TIMEOUT_MS = 12000

interface SuggestTagsWithOpenAIInput {
  noteText: string
  candidateTags: string[]
  apiKey?: string | null
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
  error?: {
    message?: unknown
  }
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

function normalizeTags(tags: string[]): string[] {
  const uniqueTags = new Set<string>()

  for (const rawTag of tags) {
    const normalizedTag = rawTag
      .trim()
      .replace(/^#+/, '')
      .toLowerCase()
      .replace(/[_\s]+/g, '-')

    if (!normalizedTag || normalizedTag.length < 3) continue
    uniqueTags.add(normalizedTag)
  }

  return Array.from(uniqueTags)
}

function parseTagsFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === 'string')
  }

  if (!value || typeof value !== 'object') {
    return []
  }

  const payload = value as { tags?: unknown }
  if (!Array.isArray(payload.tags)) {
    return []
  }

  return payload.tags.filter((tag): tag is string => typeof tag === 'string')
}

function parseTagsFromContent(content: string): string[] {
  const normalizedContent = normalizeString(content)
  if (!normalizedContent) {
    return []
  }

  const tryParse = (candidate: string): string[] => {
    try {
      return parseTagsFromUnknown(JSON.parse(candidate))
    } catch {
      return []
    }
  }

  const directParse = tryParse(normalizedContent)
  if (directParse.length > 0) {
    return directParse
  }

  const fencedMatch = normalizedContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    const fencedParse = tryParse(fencedMatch[1])
    if (fencedParse.length > 0) {
      return fencedParse
    }
  }

  const jsonArrayStart = normalizedContent.indexOf('[')
  const jsonArrayEnd = normalizedContent.lastIndexOf(']')
  if (jsonArrayStart >= 0 && jsonArrayEnd > jsonArrayStart) {
    const slicedParse = tryParse(normalizedContent.slice(jsonArrayStart, jsonArrayEnd + 1))
    if (slicedParse.length > 0) {
      return slicedParse
    }
  }

  return []
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return value.slice(0, maxLength).trim()
}

function getCompletionContent(payload: ChatCompletionResponse | null): string {
  if (!payload || !Array.isArray(payload.choices) || payload.choices.length === 0) {
    return ''
  }

  const content = payload.choices[0]?.message?.content
  return typeof content === 'string' ? content : ''
}

function getApiErrorMessage(payload: ChatCompletionResponse | null): string {
  return normalizeString(payload?.error?.message)
}

export async function suggestTagsWithOpenAI(input: SuggestTagsWithOpenAIInput): Promise<string[]> {
  const normalizedNoteText = normalizeString(input.noteText)
  if (!normalizedNoteText) {
    return []
  }

  const normalizedApiKey = normalizeString(input.apiKey)
  const apiKey = normalizedApiKey || (await getOpenAIApiKey())
  if (!apiKey) {
    return []
  }

  const normalizedCandidateTags = normalizeTags(input.candidateTags).slice(0, MAX_CANDIDATE_TAGS)
  const truncatedNoteText = truncateText(normalizedNoteText, MAX_NOTE_TEXT_LENGTH)
  const abortController = new AbortController()
  const timeout = window.setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: 96,
        messages: [
          {
            role: 'system',
            content:
              'You generate concise note tags. Respond with a JSON array only. Max 5 tags. Each tag must be lowercase kebab-case (hyphens only, no underscores, no spaces, no leading #). Reuse existing tags exactly as given whenever they fit. Only invent a new tag when none of the existing tags apply.',
          },
          {
            role: 'user',
            content: [
              'Suggest relevant tags for this note.',
              'Prefer candidate tags when they fit.',
              '',
              `Existing workspace tags (reuse these): ${JSON.stringify(normalizedCandidateTags)}`,
              `Note text: ${JSON.stringify(truncatedNoteText)}`,
            ].join('\n'),
          },
        ],
      }),
      signal: abortController.signal,
    })

    const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null

    if (!response.ok) {
      const apiMessage = getApiErrorMessage(payload)
      throw new Error(apiMessage || `OpenAI tag suggestion failed with status ${response.status}.`)
    }

    const content = getCompletionContent(payload)
    const parsedTags = parseTagsFromContent(content)
    return normalizeTags(parsedTags).slice(0, MAX_SUGGESTED_TAGS)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return []
    }

    console.error('[auto-tagging] Failed to suggest tags with OpenAI:', error)
    return []
  } finally {
    window.clearTimeout(timeout)
  }
}
