
import axios from 'axios'

class ResourceManager {
  // Map original URL -> Blob URL
  private blobUrls: Map<string, string> = new Map()
  private pendingRequests: Map<string, Promise<void>> = new Map()

  async preload(url: string): Promise<void> {
    if (this.blobUrls.has(url)) return
    if (this.pendingRequests.has(url)) return this.pendingRequests.get(url)

    const promise = axios.get(url, { responseType: 'blob' })
      .then(response => {
        const blob = response.data
        const objectUrl = URL.createObjectURL(blob)
        this.blobUrls.set(url, objectUrl)
        this.pendingRequests.delete(url)
      })
      .catch(e => {
        console.warn(`Failed to preload asset: ${url}`, e)
        this.pendingRequests.delete(url)
      })

    this.pendingRequests.set(url, promise)
    return promise
  }

  // Alias for compatibility, but now they do the same thing
  async preloadImage(url: string): Promise<void> {
    return this.preload(url)
  }

  async preloadAudio(url: string): Promise<void> {
    return this.preload(url)
  }

  getResolvedUrl(url: string): string {
    return this.blobUrls.get(url) || url
  }

  isLoaded(url: string): boolean {
    return this.blobUrls.has(url)
  }
}

export const resourceManager = new ResourceManager()
