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

  // Adaptive weights based on query length.
  // Short queries (1 word) → BM25-heavy (exact match matters more).
  // Long queries (5+ words) → semantic-heavy (phrase meaning matters more).
  let semanticWeight: number
  let bm25Weight: number

  if (wordCount <= 1) {
    semanticWeight = 0.3
    bm25Weight = 0.7
  } else if (wordCount <= 4) {
    semanticWeight = 0.5
    bm25Weight = 0.5
  } else {
    semanticWeight = 0.7
    bm25Weight = 0.3
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
