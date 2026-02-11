import { getDocumentsFolder, getDocumentsFolderAsync } from '@/lib/settings/documents-folder'
import type { Document, DocumentListItem, CreateDocumentPayload, UpdateDocumentPayload } from '@/types/documents'
const STORAGE_UNAVAILABLE_ERROR_MESSAGE = 'Local documents storage is unavailable. Open Tentacle in the desktop app to access your files.'
const DEFAULT_TITLE = 'Untitled'
const TRASH_FOLDER_NAME = '.trash'
const MARKDOWN_EXTENSION = '.md'

interface FsDirEntry {
  name?: string | null
  path?: string
  isFile?: boolean
  isDirectory?: boolean
}

interface FsApi {
  readDir: (path: string, options?: { recursive?: boolean }) => Promise<FsDirEntry[]>
  readTextFile: (path: string) => Promise<string>
  writeTextFile: (path: string, data: string) => Promise<void>
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
  rename: (oldPath: string, newPath: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
}

interface MarkdownFrontmatter {
  id: string
  created_at: string
  updated_at: string
  banner_image_url: string | null
}

interface StoredDocumentRecord {
  metadata: MarkdownFrontmatter
  title: string
  body: string
}

interface TiptapMark {
  type: string
}

interface TiptapNode {
  type?: string
  attrs?: {
    level?: number
    start?: number
  }
  text?: string
  marks?: TiptapMark[]
  content?: TiptapNode[]
}

interface TiptapDocument {
  type: 'doc'
  content: TiptapNode[]
}

async function invokePlugin<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke, isTauri } = await import('@tauri-apps/api/core')
  if (!isTauri()) {
    throw new Error(STORAGE_UNAVAILABLE_ERROR_MESSAGE)
  }

  return invoke<T>(command, args)
}

async function invokePluginWithFallbacks<T>(command: string, payloads: Record<string, unknown>[]): Promise<T> {
  let lastError: unknown
  for (const payload of payloads) {
    try {
      return await invokePlugin<T>(command, payload)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error(STORAGE_UNAVAILABLE_ERROR_MESSAGE)
}

async function getFsApi(): Promise<FsApi> {
  return {
    readDir: async (path, options) => invokePluginWithFallbacks<FsDirEntry[]>('plugin:fs|read_dir', [
      { path, options: options ?? {} },
      { path, recursive: options?.recursive ?? false },
      { path },
    ]),
    readTextFile: async (path) => invokePluginWithFallbacks<string>('plugin:fs|read_text_file', [
      { path },
      { filePath: path },
    ]),
    writeTextFile: async (path, data) => {
      await invokePluginWithFallbacks<void>('plugin:fs|write_text_file', [
        { path, contents: data },
        { path, data },
        { filePath: path, contents: data },
      ])
    },
    mkdir: async (path, options) => {
      await invokePluginWithFallbacks<void>('plugin:fs|mkdir', [
        { path, options: options ?? {} },
        { path, recursive: options?.recursive ?? false },
      ])
    },
    rename: async (oldPath, newPath) => {
      await invokePluginWithFallbacks<void>('plugin:fs|rename', [
        { oldPath, newPath },
        { from: oldPath, to: newPath },
      ])
    },
    exists: async (path) => invokePluginWithFallbacks<boolean>('plugin:fs|exists', [
      { path },
      { filePath: path },
    ]),
  }
}

async function getConfiguredDocumentsFolder(): Promise<string> {
  // Try to get user-configured folder first
  const folder = getDocumentsFolder()
  if (folder) {
    return trimTrailingSeparators(folder)
  }

  // Fall back to default folder
  const defaultFolder = await getDocumentsFolderAsync()
  return trimTrailingSeparators(defaultFolder)
}

function trimTrailingSeparators(path: string): string {
  const trimmed = path.trim()
  if (trimmed === '/' || /^[A-Za-z]:\\$/.test(trimmed)) {
    return trimmed
  }

  return trimmed.replace(/[\\/]+$/, '')
}

function getPathSeparator(basePath: string): '/' | '\\' {
  if (basePath.includes('\\') && !basePath.includes('/')) {
    return '\\'
  }
  return '/'
}

function joinPath(basePath: string, ...segments: string[]): string {
  const separator = getPathSeparator(basePath)
  const normalizedBase = trimTrailingSeparators(basePath)
  const normalizedSegments = segments
    .map((segment) => segment.replace(/^[\\/]+|[\\/]+$/g, ''))
    .filter((segment) => segment.length > 0)

  return [normalizedBase, ...normalizedSegments].join(separator)
}

function getFileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? ''
}

function ensureValidDocumentId(id: string): void {
  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    throw new Error('Invalid document id')
  }
}

function documentPath(folder: string, id: string): string {
  ensureValidDocumentId(id)
  return joinPath(folder, `${id}${MARKDOWN_EXTENSION}`)
}

function normalizeTitle(title: string | undefined): string {
  const normalized = (title ?? '')
    .replace(/\r?\n/g, ' ')
    .trim()
  return normalized.length > 0 ? normalized : DEFAULT_TITLE
}

function nowIsoString(): string {
  return new Date().toISOString()
}

function generateDocumentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n')
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function unquoteYamlValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }

  return value
}

function parseFrontmatter(fileContent: string): { metadata: Partial<MarkdownFrontmatter>, markdown: string } {
  const normalized = normalizeLineEndings(fileContent)
  if (!normalized.startsWith('---\n')) {
    return { metadata: {}, markdown: normalized }
  }

  const endIndex = normalized.indexOf('\n---\n', 4)
  if (endIndex === -1) {
    return { metadata: {}, markdown: normalized }
  }

  const rawFrontmatter = normalized.slice(4, endIndex)
  const markdown = normalized.slice(endIndex + 5)
  const metadata: Partial<MarkdownFrontmatter> = {}

  for (const line of rawFrontmatter.split('\n')) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    const value = rawValue === 'null' ? null : unquoteYamlValue(rawValue)

    if (key === 'id' && typeof value === 'string') {
      metadata.id = value
      continue
    }

    if (key === 'created_at' && typeof value === 'string') {
      metadata.created_at = value
      continue
    }

    if (key === 'updated_at' && typeof value === 'string') {
      metadata.updated_at = value
      continue
    }

    if (key === 'banner_image_url') {
      metadata.banner_image_url = typeof value === 'string' ? value : null
    }
  }

  return { metadata, markdown }
}

function extractTitleAndMarkdownBody(markdown: string): { title: string, bodyMarkdown: string } {
  const normalized = normalizeLineEndings(markdown)
  const lines = normalized.split('\n')

  let index = 0
  while (index < lines.length && lines[index].trim().length === 0) {
    index += 1
  }

  if (index < lines.length) {
    const headingMatch = lines[index].match(/^#\s+(.+)$/)
    if (headingMatch) {
      const title = normalizeTitle(headingMatch[1])
      let bodyStartIndex = index + 1
      while (bodyStartIndex < lines.length && lines[bodyStartIndex].trim().length === 0) {
        bodyStartIndex += 1
      }

      return {
        title,
        bodyMarkdown: lines.slice(bodyStartIndex).join('\n').trim(),
      }
    }
  }

  return {
    title: DEFAULT_TITLE,
    bodyMarkdown: normalized.trim(),
  }
}

function serializeFrontmatter(metadata: MarkdownFrontmatter): string {
  const bannerValue = metadata.banner_image_url === null
    ? 'null'
    : `"${escapeYamlString(metadata.banner_image_url)}"`

  return [
    '---',
    `id: "${escapeYamlString(metadata.id)}"`,
    `created_at: "${escapeYamlString(metadata.created_at)}"`,
    `updated_at: "${escapeYamlString(metadata.updated_at)}"`,
    `banner_image_url: ${bannerValue}`,
    '---',
    '',
  ].join('\n')
}

function sanitizeTitleForHeading(title: string): string {
  return normalizeTitle(title).replace(/^#+\s*/, '')
}

function buildMarkdownFile(record: StoredDocumentRecord): string {
  const frontmatter = serializeFrontmatter(record.metadata)
  const titleHeading = `# ${sanitizeTitleForHeading(record.title)}`
  const body = normalizeLineEndings(record.body).trim()
  const markdownBody = body.length > 0 ? `${titleHeading}\n\n${body}` : `${titleHeading}\n`

  return `${frontmatter}${markdownBody}`
}

function isTiptapDocument(value: unknown): value is TiptapDocument {
  if (!value || typeof value !== 'object') return false
  const maybeDoc = value as TiptapDocument
  return maybeDoc.type === 'doc' && Array.isArray(maybeDoc.content)
}

function applyMarks(text: string, marks: TiptapMark[] | undefined): string {
  let result = text
  for (const mark of marks ?? []) {
    if (mark.type === 'code') {
      result = `\`${result.replace(/`/g, '\\`')}\``
      continue
    }

    if (mark.type === 'bold') {
      result = `**${result}**`
      continue
    }

    if (mark.type === 'italic') {
      result = `*${result}*`
      continue
    }

    if (mark.type === 'strike') {
      result = `~~${result}~~`
    }
  }

  return result
}

function renderInlineNode(node: TiptapNode): string {
  if (node.type === 'text') {
    return applyMarks(node.text ?? '', node.marks)
  }

  if (node.type === 'hardBreak') {
    return '  \n'
  }

  const nested = node.content ?? []
  return nested.map(renderInlineNode).join('')
}

function renderListItem(item: TiptapNode): string {
  const content = item.content ?? []
  if (content.length === 0) return ''

  const parts = content
    .map(renderBlockNode)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 0) return ''

  const [first, ...rest] = parts
  const indentedRest = rest.map((part) => part.split('\n').map((line) => `  ${line}`).join('\n'))
  return [first, ...indentedRest].join('\n')
}

function renderBlockNode(node: TiptapNode): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.max(1, Math.min(6, node.attrs?.level ?? 1))
      const text = (node.content ?? []).map(renderInlineNode).join('')
      return `${'#'.repeat(level)} ${text}`.trim()
    }
    case 'paragraph':
      return (node.content ?? []).map(renderInlineNode).join('')
    case 'bulletList':
      return (node.content ?? [])
        .map((item) => `- ${renderListItem(item)}`.trimEnd())
        .join('\n')
    case 'orderedList': {
      const start = node.attrs?.start && Number.isFinite(node.attrs.start) ? node.attrs.start : 1
      return (node.content ?? [])
        .map((item, index) => `${start + index}. ${renderListItem(item)}`.trimEnd())
        .join('\n')
    }
    case 'listItem':
      return renderListItem(node)
    case 'blockquote': {
      const block = (node.content ?? [])
        .map(renderBlockNode)
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .join('\n\n')
      return block
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    }
    case 'codeBlock': {
      const text = (node.content ?? []).map((child) => child.text ?? '').join('')
      return `\`\`\`\n${text}\n\`\`\``
    }
    case 'horizontalRule':
      return '---'
    default:
      return (node.content ?? []).map(renderInlineNode).join('')
  }
}

function tiptapJsonToMarkdown(body: string): string {
  if (!body || body.trim().length === 0) {
    return ''
  }

  try {
    const parsed: unknown = JSON.parse(body)
    if (!isTiptapDocument(parsed)) {
      return normalizeLineEndings(body).trim()
    }

    const content = parsed.content
      .map(renderBlockNode)
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .join('\n\n')

    return content.trim()
  } catch {
    return normalizeLineEndings(body).trim()
  }
}

function parseInlineMarkdown(text: string): TiptapNode[] {
  if (text.length === 0) {
    return []
  }

  const nodes: TiptapNode[] = []
  const inlinePattern = /(\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`|\*[^*]+\*)/
  let remaining = text

  while (remaining.length > 0) {
    const match = remaining.match(inlinePattern)
    if (!match || match.index === undefined) {
      nodes.push({ type: 'text', text: remaining })
      break
    }

    if (match.index > 0) {
      nodes.push({ type: 'text', text: remaining.slice(0, match.index) })
    }

    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push({
        type: 'text',
        text: token.slice(2, -2),
        marks: [{ type: 'bold' }],
      })
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push({
        type: 'text',
        text: token.slice(1, -1),
        marks: [{ type: 'italic' }],
      })
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      nodes.push({
        type: 'text',
        text: token.slice(2, -2),
        marks: [{ type: 'strike' }],
      })
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push({
        type: 'text',
        text: token.slice(1, -1),
        marks: [{ type: 'code' }],
      })
    } else {
      nodes.push({ type: 'text', text: token })
    }

    remaining = remaining.slice(match.index + token.length)
  }

  return nodes
}

function isMarkdownBlockStart(line: string): boolean {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^```/.test(line) ||
    line.trim() === '---'
  )
}

function paragraphNodeFromText(text: string): TiptapNode {
  const lineParts = text.split('\n')
  const content: TiptapNode[] = []

  for (const [index, line] of lineParts.entries()) {
    content.push(...parseInlineMarkdown(line))
    if (index < lineParts.length - 1) {
      content.push({ type: 'hardBreak' })
    }
  }

  if (content.length === 0) {
    return { type: 'paragraph' }
  }

  return { type: 'paragraph', content }
}

function listItemNodeFromText(text: string): TiptapNode {
  return {
    type: 'listItem',
    content: [paragraphNodeFromText(text)],
  }
}

function markdownToTiptapDocument(markdown: string): TiptapDocument {
  const lines = normalizeLineEndings(markdown).split('\n')
  const content: TiptapNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (line.trim().length === 0) {
      index += 1
      continue
    }

    if (line.startsWith('```')) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length && lines[index].startsWith('```')) {
        index += 1
      }
      content.push({
        type: 'codeBlock',
        content: codeLines.length > 0 ? [{ type: 'text', text: codeLines.join('\n') }] : [],
      })
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      content.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInlineMarkdown(headingMatch[2]),
      })
      index += 1
      continue
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: TiptapNode[] = []
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(listItemNodeFromText(lines[index].replace(/^\s*[-*]\s+/, '')))
        index += 1
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const firstMatch = line.match(/^\s*(\d+)\.\s+(.+)$/)
      const start = firstMatch ? Number.parseInt(firstMatch[1], 10) : 1
      const items: TiptapNode[] = []

      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        const itemMatch = lines[index].match(/^\s*\d+\.\s+(.+)$/)
        items.push(listItemNodeFromText(itemMatch?.[1] ?? ''))
        index += 1
      }

      content.push({
        type: 'orderedList',
        attrs: { start },
        content: items,
      })
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      content.push({
        type: 'blockquote',
        content: [paragraphNodeFromText(quoteLines.join('\n').trim())],
      })
      continue
    }

    if (line.trim() === '---') {
      content.push({ type: 'horizontalRule' })
      index += 1
      continue
    }

    const paragraphLines = [line]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !isMarkdownBlockStart(lines[index])
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }

    content.push(paragraphNodeFromText(paragraphLines.join('\n')))
  }

  return { type: 'doc', content }
}

function markdownToTiptapBody(markdown: string): string {
  const normalized = normalizeLineEndings(markdown).trim()
  if (normalized.length === 0) {
    return ''
  }

  return JSON.stringify(markdownToTiptapDocument(normalized))
}

function mapStoredRecordToDocument(record: StoredDocumentRecord): Document {
  return {
    id: record.metadata.id,
    user_id: 'local',
    title: record.title,
    body: record.body,
    banner_image_url: record.metadata.banner_image_url,
    deleted_at: null,
    created_at: record.metadata.created_at,
    updated_at: record.metadata.updated_at,
  }
}

async function readStoredDocument(fs: FsApi, folder: string, id: string): Promise<StoredDocumentRecord> {
  const path = documentPath(folder, id)
  let fileContent: string

  try {
    fileContent = await fs.readTextFile(path)
  } catch {
    throw new Error(`Document "${id}" was not found.`)
  }

  const { metadata: parsedMetadata, markdown } = parseFrontmatter(fileContent)
  const { title, bodyMarkdown } = extractTitleAndMarkdownBody(markdown)
  const now = nowIsoString()

  const metadata: MarkdownFrontmatter = {
    id: parsedMetadata.id ?? id,
    created_at: parsedMetadata.created_at ?? now,
    updated_at: parsedMetadata.updated_at ?? parsedMetadata.created_at ?? now,
    banner_image_url: parsedMetadata.banner_image_url ?? null,
  }

  return {
    metadata,
    title,
    body: markdownToTiptapBody(bodyMarkdown),
  }
}

async function writeStoredDocument(fs: FsApi, folder: string, record: StoredDocumentRecord): Promise<void> {
  const path = documentPath(folder, record.metadata.id)
  const markdownContent = buildMarkdownFile({
    ...record,
    title: normalizeTitle(record.title),
    body: tiptapJsonToMarkdown(record.body),
  })

  await fs.writeTextFile(path, markdownContent)
}

async function listStoredDocumentIds(fs: FsApi, folder: string): Promise<string[]> {
  const entries = await fs.readDir(folder, { recursive: false })

  return entries
    .filter((entry) => entry.isDirectory !== true)
    .map((entry) => entry.name ?? (entry.path ? getFileNameFromPath(entry.path) : ''))
    .filter((name) => name.toLowerCase().endsWith(MARKDOWN_EXTENSION))
    .map((name) => name.slice(0, -MARKDOWN_EXTENSION.length))
    .filter((id) => id.length > 0)
}

export async function fetchDocuments(): Promise<DocumentListItem[]> {
  try {
    const folder = await getConfiguredDocumentsFolder()
    const fs = await getFsApi()
    const ids = await listStoredDocumentIds(fs, folder)

    const documents = await Promise.all(
      ids.map(async (id) => {
        const record = await readStoredDocument(fs, folder, id)
        return mapStoredRecordToDocument(record)
      }),
    )

    return documents
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(({ id, title, body, banner_image_url, created_at, updated_at }) => ({
        id,
        title,
        body,
        banner_image_url,
        created_at,
        updated_at,
      }))
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch documents: ${error.message}`)
    }
    throw new Error('Failed to fetch documents: Unexpected error')
  }
}

export async function createDocument(payload?: CreateDocumentPayload): Promise<Document> {
  try {
    const folder = await getConfiguredDocumentsFolder()
    const fs = await getFsApi()
    const timestamp = nowIsoString()
    const id = generateDocumentId()

    const record: StoredDocumentRecord = {
      metadata: {
        id,
        created_at: timestamp,
        updated_at: timestamp,
        banner_image_url: null,
      },
      title: normalizeTitle(payload?.title),
      body: '',
    }

    await writeStoredDocument(fs, folder, record)
    return mapStoredRecordToDocument(record)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create document: ${error.message}`)
    }
    throw new Error('Failed to create document: Unexpected error')
  }
}

export async function fetchDocument(id: string): Promise<Document> {
  try {
    const folder = await getConfiguredDocumentsFolder()
    const fs = await getFsApi()
    const record = await readStoredDocument(fs, folder, id)
    return mapStoredRecordToDocument(record)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch document: ${error.message}`)
    }
    throw new Error('Failed to fetch document: Unexpected error')
  }
}

export async function updateDocument(id: string, payload: UpdateDocumentPayload): Promise<Document> {
  try {
    const folder = await getConfiguredDocumentsFolder()
    const fs = await getFsApi()
    const existing = await readStoredDocument(fs, folder, id)

    const updatedRecord: StoredDocumentRecord = {
      metadata: {
        ...existing.metadata,
        updated_at: nowIsoString(),
        banner_image_url: payload.banner_image_url !== undefined
          ? payload.banner_image_url
          : existing.metadata.banner_image_url,
      },
      title: payload.title !== undefined ? normalizeTitle(payload.title) : existing.title,
      body: payload.body !== undefined ? payload.body : existing.body,
    }

    await writeStoredDocument(fs, folder, updatedRecord)
    return mapStoredRecordToDocument(updatedRecord)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to update document: ${error.message}`)
    }
    throw new Error('Failed to update document: Unexpected error')
  }
}

export async function deleteDocument(id: string): Promise<void> {
  try {
    const folder = await getConfiguredDocumentsFolder()
    const fs = await getFsApi()
    const sourcePath = documentPath(folder, id)
    const trashFolder = joinPath(folder, TRASH_FOLDER_NAME)
    const baseFileName = `${id}${MARKDOWN_EXTENSION}`

    await fs.mkdir(trashFolder, { recursive: true })

    let destinationPath = joinPath(trashFolder, baseFileName)
    if (await fs.exists(destinationPath)) {
      destinationPath = joinPath(trashFolder, `${id}-${Date.now()}${MARKDOWN_EXTENSION}`)
    }

    await fs.rename(sourcePath, destinationPath)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to delete document: ${error.message}`)
    }
    throw new Error('Failed to delete document: Unexpected error')
  }
}
