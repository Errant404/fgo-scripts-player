
import axios from 'axios'

interface CacheEntry {
  objectUrl: string
  size: number
  lastUsed: number
}

class ResourceManager {
  // Map original URL -> CacheEntry
  private cache: Map<string, CacheEntry> = new Map()
  private pendingRequests: Map<string, Promise<void>> = new Map()

  private currentSize: number = 0
  // Limit to 50MB (approx)
  private readonly MAX_SIZE: number = 50 * 1024 * 1024

  async preload(url: string): Promise<void> {
    if (this.cache.has(url)) {
      this.touch(url)
      return
    }
    if (this.pendingRequests.has(url)) return this.pendingRequests.get(url)

    const promise = axios.get(url, { responseType: 'blob' })
      .then(response => {
        const blob = response.data as Blob
        const size = blob.size

        // If single file is larger than max size, don't cache it (or handle gracefully)
        if (size > this.MAX_SIZE) {
          console.warn(`Asset too large to cache: ${url} (${size} bytes)`)
          return
        }

        // Evict if needed
        this.ensureSpace(size)

        const objectUrl = URL.createObjectURL(blob)
        this.cache.set(url, {
          objectUrl,
          size,
          lastUsed: Date.now()
        })
        this.currentSize += size

        this.pendingRequests.delete(url)
      })
      .catch(e => {
        console.warn(`Failed to preload asset: ${url}`, e)
        this.pendingRequests.delete(url)
      })

    this.pendingRequests.set(url, promise)
    return promise
  }

  private touch(url: string) {
    const entry = this.cache.get(url)
    if (entry) {
      // Update lastUsed and move to end of Map (LRU behavior)
      entry.lastUsed = Date.now()
      this.cache.delete(url)
      this.cache.set(url, entry)
    }
  }

  private ensureSpace(requiredSize: number) {
    while (this.currentSize + requiredSize > this.MAX_SIZE && this.cache.size > 0) {
      // Map iterator yields in insertion order.
      // Since we re-insert on access (touch), the first item is the LRU.
      const iterator = this.cache.keys()
      const lruKey = iterator.next().value
      if (lruKey) {
        this.remove(lruKey)
      } else {
        break
      }
    }
  }

  private remove(url: string) {
    const entry = this.cache.get(url)
    if (entry) {
      URL.revokeObjectURL(entry.objectUrl)
      this.currentSize -= entry.size
      this.cache.delete(url)
    }
  }

  // Alias for compatibility, but now they do the same thing
  async preloadImage(url: string): Promise<void> {
    return this.preload(url)
  }

  async preloadAudio(url: string): Promise<void> {
    return this.preload(url)
  }

  getResolvedUrl(url: string): string {
    if (this.cache.has(url)) {
      this.touch(url)
      return this.cache.get(url)!.objectUrl
    }
    return url
  }

  isLoaded(url: string): boolean {
    return this.cache.has(url)
  }

  releaseAll(): void {
    this.cache.forEach((entry) => {
      URL.revokeObjectURL(entry.objectUrl)
    })
    this.cache.clear()
    this.currentSize = 0
    this.pendingRequests.clear()
  }
}

export const resourceManager = new ResourceManager()
