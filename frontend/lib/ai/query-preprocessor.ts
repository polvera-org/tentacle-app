// Abbreviation map for semantic embedding normalization only.
// These expansions are NOT used for the FTS query — the FTS query always uses original tokens
// so exact matches in the index are not broken.
const ABBREVIATION_MAP: Record<string, string> = {
  ml: 'machine learning',
  ai: 'artificial intelligence',
  db: 'database',
  api: 'application programming interface',
  cli: 'command line interface',
  sdk: 'software development kit',
  os: 'operating system',
  ui: 'user interface',
  ux: 'user experience',
  ci: 'continuous integration',
  cd: 'continuous deployment',
  devops: 'development operations',
  auth: 'authentication',
  sso: 'single sign on',
  jwt: 'json web token',
  oauth: 'open authorization',
  http: 'hypertext transfer protocol',
  https: 'hypertext transfer protocol secure',
  url: 'uniform resource locator',
  sql: 'structured query language',
  nosql: 'non relational database',
  css: 'cascading style sheets',
  html: 'hypertext markup language',
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  k8s: 'kubernetes',
  aws: 'amazon web services',
  gcp: 'google cloud platform',
}

export interface ProcessedQuery {
  /** Normalized query for semantic embedding (with abbreviation expansion). */
  normalized: string
  /** Original tokens joined for FTS5 (no expansion, preserves exact terms). */
  ftsQuery: string
  /** Weight for the semantic/vector leg of hybrid search. */
  semanticWeight: number
  /** Weight for the BM25/FTS5 leg of hybrid search. */
  bm25Weight: number
}

/**
 * Pre-process a raw user search query into a normalized form for embedding,
 * an FTS5 query string, and adaptive weights based on query length.
 */
export function preprocessQuery(raw: string): ProcessedQuery {
  const trimmed = raw.trim()
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0)
  const wordCount = words.length
  const hasLongSingleWord = wordCount === 1 && words[0].length >= 5

  // Adaptive weights based on query length.
  // Short queries (1 word) → BM25-heavy (exact match matters more).
  // Long queries (5+ words) → semantic-heavy (phrase meaning matters more).
  let semanticWeight: number
  let bm25Weight: number

  if (wordCount <= 1) {
    if (hasLongSingleWord) {
      semanticWeight = 0.2
      bm25Weight = 0.8
    } else {
      semanticWeight = 0.0
      bm25Weight = 1.0
    }
  } else if (wordCount <= 4) {
    semanticWeight = 0.35
    bm25Weight = 0.65
  } else {
    semanticWeight = 0.55
    bm25Weight = 0.45
  }

  // FTS query: original tokens unchanged (preserve exact terms like "OAuth", "API").
  const ftsQuery = trimmed

  // Normalized query: expand abbreviations for better semantic matching.
  const normalizedTokens = words.map((word) => {
    const lower = word.toLowerCase()
    return ABBREVIATION_MAP[lower] ?? word
  })
  const normalized = normalizedTokens.join(' ')

  return { normalized, ftsQuery, semanticWeight, bm25Weight }
}
