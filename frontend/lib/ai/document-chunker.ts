// Target: ~200 tokens (~800 chars) per chunk with ~50-token (~200 char) overlap.
// Splits on paragraph boundaries (\n\n), prepends title to every chunk for context.
// Short documents produce a single chunk (equivalent to current whole-doc behavior).

const TARGET_CHUNK_CHARS = 800
const OVERLAP_CHARS = 200

export interface DocumentChunk {
  /** The text content of this chunk, including the prepended title. */
  text: string
  /** Zero-based index of this chunk within the document. */
  index: number
}

/**
 * Split `bodyText` into overlapping chunks and prepend the document title to each.
 * Returns at least one chunk even for empty bodies.
 */
export function chunkDocumentText(title: string, bodyText: string): DocumentChunk[] {
  const normalizedTitle = title.trim()
  const normalizedBody = bodyText.trim()

  if (normalizedBody.length === 0) {
    return [{ text: normalizedTitle, index: 0 }]
  }

  // Short documents — emit one chunk.
  if (normalizedBody.length <= TARGET_CHUNK_CHARS) {
    return [{ text: buildChunkText(normalizedTitle, normalizedBody), index: 0 }]
  }

  // Split on paragraph boundaries.
  const paragraphs = normalizedBody.split(/\n\n+/)
  const chunks: DocumentChunk[] = []
  let current = ''
  let chunkIndex = 0

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim()
    if (trimmed.length === 0) {
      continue
    }

    const separator = current.length > 0 ? '\n\n' : ''
    const candidate = `${current}${separator}${trimmed}`

    if (candidate.length > TARGET_CHUNK_CHARS && current.length > 0) {
      // Emit the current chunk.
      chunks.push({ text: buildChunkText(normalizedTitle, current), index: chunkIndex })
      chunkIndex += 1

      // Start the next chunk with overlap from the tail of the previous.
      const overlapText = current.length > OVERLAP_CHARS
        ? current.slice(current.length - OVERLAP_CHARS)
        : current

      current = `${overlapText}\n\n${trimmed}`
    } else {
      current = candidate
    }
  }

  // Emit any remaining text.
  if (current.length > 0) {
    chunks.push({ text: buildChunkText(normalizedTitle, current), index: chunkIndex })
  }

  return chunks.length > 0 ? chunks : [{ text: buildChunkText(normalizedTitle, normalizedBody), index: 0 }]
}

function buildChunkText(title: string, body: string): string {
  if (title.length === 0) {
    return body
  }

  return `${title}\n\n${body}`
}
