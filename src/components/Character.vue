<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { getSvtScript, Region } from '@/api/atlas'
import { getAssetUrl } from '@/utils/asset'
import { resourceManager } from '@/utils/resourceManager'
import type { Script } from '@atlasacademy/api-connector'

const props = defineProps<{
  charaGraphId: number
  face: number // 0-based index from script
  region?: string
}>()

const scriptData = ref<Script.SvtScript | null>(null)
const imageSize = ref({ width: 1024, height: 1024 })
const isLoading = ref(false)
const composedImageUrl = ref<string | null>(null)

const currentRegion = computed(() => (props.region as Region) || Region.JP)
const assetUrl = computed(() =>
  getAssetUrl(
    `CharaFigure/${props.charaGraphId}/${props.charaGraphId}_merged.png`,
    currentRegion.value,
  ),
)

const fetchScript = async () => {
  const currentId = props.charaGraphId
  if (!currentId) return

  // Reset state to prevent showing stale data (fixes "slight movement" glitch)
  scriptData.value = null
  composedImageUrl.value = null
  isLoading.value = true

  try {
    console.log(`Fetching data for charaId: ${currentId}`)

    // Capture the URL at the start to ensure consistency
    const rawUrl = assetUrl.value
    const url = resourceManager.getResolvedUrl(rawUrl)

    // Load Image to get dimensions
    const imagePromise = new Promise<{ width: number; height: number; image: HTMLImageElement }>(
      (resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous' // Enable CORS for canvas
        img.src = url
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, image: img })
        img.onerror = (e) => reject(e)
      },
    )

    // Fetch Script
    const scriptPromise = getSvtScript(currentId, currentRegion.value)

    const [{ width, height, image }, script] = await Promise.all([imagePromise, scriptPromise])

    // Race condition check: If props changed while fetching, discard result
    if (props.charaGraphId !== currentId) {
      console.log('Character changed during fetch, ignoring result')
      return
    }

    if (script) {
      imageSize.value = { width, height }
      scriptData.value = script
      // Compose the image with face
      await composeCharacterImage(image, script, width, height)
    } else {
      console.warn('No script data found for character')
    }
  } catch (e) {
    console.error('Failed to fetch character data', e)
  } finally {
    if (props.charaGraphId === currentId) {
      isLoading.value = false
    }
  }
}

// Compose body and face into a single canvas image
const composeCharacterImage = async (
  img: HTMLImageElement,
  script: Script.SvtScript,
  imgW: number,
  imgH: number,
) => {
  const bodyHeight = 768

  // Canvas should only be as tall as the body part we're using
  const canvas = document.createElement('canvas')
  canvas.width = imgW
  canvas.height = bodyHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Draw body (first 768 pixels height from source image)
  ctx.drawImage(img, 0, 0, imgW, bodyHeight, 0, 0, imgW, bodyHeight)

  // Calculate face position and draw it
  const faceIndex = props.face - 1
  const defaultFaceSize = 256
  const faceStartHeight = 768

  const faceSizeWidth =
    script.extendData.faceSizeRect?.[0] ?? script.extendData.faceSize ?? defaultFaceSize
  const faceSizeHeight =
    script.extendData.faceSizeRect?.[1] ?? script.extendData.faceSize ?? defaultFaceSize

  // Grid layout: 4 faces per row, starting at y=768 in source image
  const perRow = 4
  const col = faceIndex % perRow
  const row = Math.floor(faceIndex / perRow)

  const sourceFaceX = col * faceSizeWidth
  const sourceFaceY = faceStartHeight + row * faceSizeHeight

  // Draw face on top of body at the correct position (faceX, faceY are in original image coordinates)
  ctx.drawImage(
    img,
    sourceFaceX,
    sourceFaceY,
    faceSizeWidth,
    faceSizeHeight,
    script.faceX,
    script.faceY,
    faceSizeWidth,
    faceSizeHeight,
  )

  // Convert canvas to data URL
  composedImageUrl.value = canvas.toDataURL('image/png')
}

onMounted(() => {
  fetchScript()
})

watch(
  () => props.charaGraphId,
  () => {
    fetchScript()
  },
)

watch(
  () => props.face,
  () => {
    // Re-compose when face changes
    if (scriptData.value && imageSize.value.width > 0) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = assetUrl.value
      img.onload = () => {
        composeCharacterImage(img, scriptData.value!, imageSize.value.width, imageSize.value.height)
      }
    }
  },
)

// Calculations based on Scene.tsx
const containerWidth = 1024
const containerHeight = 626
const bodySourceHeight = 768

const displayStyles = computed(() => {
  if (!scriptData.value || !composedImageUrl.value) return null

  const script = scriptData.value
  const imgW = imageSize.value.width

  // Scale to fit height (626 / 768)
  const scale = containerHeight / bodySourceHeight
  const renderedWidth = imgW * scale
  const renderedHeight = containerHeight // Always 626px

  // Calculate Left: Centered in container, then shifted by offsetX
  const left = (containerWidth - renderedWidth) / 2 + script.offsetX * scale

  return {
    width: `${renderedWidth}px`,
    height: `${renderedHeight}px`,
    left: `${left}px`,
    top: '0px',
  }
})
</script>

<template>
  <div class="character-container" v-if="scriptData && composedImageUrl">
    <!-- Composed character (body + face already merged) -->
    <img
      class="character-composed"
      :src="composedImageUrl"
      :style="displayStyles"
      alt="character"
    />
  </div>
</template>

<style scoped>
.character-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.character-composed {
  position: absolute;
  object-fit: fill;
  image-rendering: auto;
  image-rendering: -webkit-optimize-contrast;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: none;
}
</style>
