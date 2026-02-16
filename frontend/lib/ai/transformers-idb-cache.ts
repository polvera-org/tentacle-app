export interface TransformersCustomCache {
  match: (request: RequestInfo | URL | string) => Promise<Response | undefined>
  put: (request: RequestInfo | URL | string, response: Response) => Promise<void>
  delete: (request: RequestInfo | URL | string) => Promise<void>
}

interface TransformersCacheRecord {
  key: string
  status: number
  statusText: string
  headers: [string, string][]
  body: ArrayBuffer
  updatedAt: number
}

const DB_NAME = 'tentacle-transformers-cache'
const DB_VERSION = 1
const STORE_NAME = 'entries'

let databasePromise: Promise<IDBDatabase> | null = null
let customCachePromise: Promise<TransformersCustomCache | null> | null = null

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined'
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDoneToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function resolveCacheKey(request: RequestInfo | URL | string): string {
  if (typeof request === 'string') {
    return request
  }

  if (request instanceof URL) {
    return request.toString()
  }

  if (typeof Request !== 'undefined' && request instanceof Request) {
    return request.url
  }

  return String(request)
}

async function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) {
    return databasePromise
  }

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const openRequest = indexedDB.open(DB_NAME, DB_VERSION)

    openRequest.onupgradeneeded = () => {
      const database = openRequest.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: 'key',
        })
      }
    }

    openRequest.onsuccess = () => {
      const database = openRequest.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      resolve(database)
    }

    openRequest.onerror = () => {
      reject(openRequest.error ?? new Error('Failed to open IndexedDB database'))
    }
  })

  return databasePromise
}

export async function createTransformersIndexedDbCache(): Promise<TransformersCustomCache | null> {
  if (customCachePromise) {
    return customCachePromise
  }

  customCachePromise = (async () => {
    if (!canUseIndexedDb()) {
      return null
    }

    const database = await openDatabase()

    return {
      async match(request: RequestInfo | URL | string): Promise<Response | undefined> {
        const key = resolveCacheKey(request)
        const transaction = database.transaction(STORE_NAME, 'readonly')
        const store = transaction.objectStore(STORE_NAME)
        const stored = await requestToPromise(store.get(key) as IDBRequest<TransformersCacheRecord | undefined>)
        await transactionDoneToPromise(transaction)

        if (!stored) {
          return undefined
        }

        return new Response(stored.body.slice(0), {
          status: stored.status,
          statusText: stored.statusText,
          headers: new Headers(stored.headers),
        })
      },

      async put(request: RequestInfo | URL | string, response: Response): Promise<void> {
        const key = resolveCacheKey(request)
        const buffer = await response.clone().arrayBuffer()
        const headers = Array.from(response.headers.entries())
        const record: TransformersCacheRecord = {
          key,
          status: response.status,
          statusText: response.statusText,
          headers,
          body: buffer,
          updatedAt: Date.now(),
        }

        const transaction = database.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        await requestToPromise(store.put(record))
        await transactionDoneToPromise(transaction)
      },

      async delete(request: RequestInfo | URL | string): Promise<void> {
        const key = resolveCacheKey(request)
        const transaction = database.transaction(STORE_NAME, 'readwrite')
        const store = transaction.objectStore(STORE_NAME)
        await requestToPromise(store.delete(key))
        await transactionDoneToPromise(transaction)
      },
    }
  })().catch((error) => {
    console.warn('[transformers-cache] IndexedDB cache unavailable:', error)
    customCachePromise = null
    return null
  })

  return customCachePromise
}
