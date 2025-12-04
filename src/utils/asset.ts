import { AssetHost } from '@/api/atlas'

export const BASE_URL = AssetHost

export const getAssetUrl = (path: string | null | undefined, region: string = 'JP') => {
  if (!path) return ''
  if (path.startsWith('http')) return path
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${BASE_URL}/${region}/${cleanPath}`
}

export const getBackgroundUrl = (id: string, region: string = 'JP') => {
  return getAssetUrl(`Back/back${id}.png`, region)
}

export const getBgmUrl = (id: string, region: string = 'JP') => {
  return getAssetUrl(`Audio/Bgm/${id}/${id}.mp3`, region)
}

export const getSeUrl = (id: string, region: string = 'JP') => {
  return getAssetUrl(`Audio/SE/${id}.mp3`, region)
}
