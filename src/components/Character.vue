<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { getSvtScript, Region } from '@/api/atlas'
import { getAssetUrl } from '@/utils/asset'
import type { Script } from '@atlasacademy/api-connector'

const props = defineProps<{
  charaGraphId: number
  face: number // 0-based index from script
  region?: string
}>()

const scriptData = ref<Script.SvtScript | null>(null)
const imageSize = ref({ width: 1024, height: 1024 })
const isLoading = ref(false)

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
  isLoading.value = true

  try {
    console.log(`Fetching data for charaId: ${currentId}`)

    // Capture the URL at the start to ensure consistency
    const url = assetUrl.value

    // Load Image to get dimensions
    const imagePromise = new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.src = url
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = (e) => reject(e)
    })

    // Fetch Script
    const scriptPromise = getSvtScript(currentId, currentRegion.value)

    const [size, script] = await Promise.all([imagePromise, scriptPromise])

    // Race condition check: If props changed while fetching, discard result
    if (props.charaGraphId !== currentId) {
      console.log('Character changed during fetch, ignoring result')
      return
    }

    if (script) {
      imageSize.value = size
      scriptData.value = script
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

onMounted(() => {
  fetchScript()
})

watch(
  () => props.charaGraphId,
  () => {
    fetchScript()
  },
)

// Calculations based on Scene.tsx
const containerWidth = 1024
const containerHeight = 626
const bodySourceHeight = 768

const geometry = computed(() => {
  if (!scriptData.value) return null
  const script = scriptData.value
  const imgW = imageSize.value.width
  const imgH = imageSize.value.height

  // Scale to fit height (626 / 768)
  const scale = containerHeight / bodySourceHeight
  const renderedWidth = imgW * scale

  // Calculate Left: Centered in container, then shifted by offsetX
  const bodyLeft = (containerWidth - renderedWidth) / 2 + script.offsetX * scale

  // Calculate Bottom: Anchored to bottom, shifted by offsetY
  // User reported "Top cropped, Bottom empty" with offsetY applied.
  // Requirement: "Stick to bottom edge".
  // We force the top of the image to align with the top of the container.
  // Since we scaled the 768px height to fit the 626px container,
  // aligning Top-to-Top implies Bottom-to-Bottom for the 768px area.
  const bodyTop = 0

  return {
    scale,
    imgW,
    imgH,
    bodyLeft,
    bodyTop,
    renderedWidth,
  }
})

const styles = computed(() => {
  if (!geometry.value) return {}
  const g = geometry.value

  return {
    body: {
      backgroundImage: `url("${assetUrl.value}")`,
      width: `${g.renderedWidth}px`,
      height: `${containerHeight}px`, // Clip to container height
      left: `${g.bodyLeft}px`,
      top: `${g.bodyTop}px`,
      backgroundSize: `${g.renderedWidth}px ${g.imgH * g.scale}px`, // Full image scaled
      backgroundPosition: 'top left', // Show top part
      backgroundRepeat: 'no-repeat',
    },
  }
})

const faceStyles = computed(() => {
  if (!scriptData.value || !geometry.value) return {}
  const script = scriptData.value
  const g = geometry.value

  // Face Logic
  // face is 0-based index from props
  const faceIndex = props.face - 1

  const defaultFaceSize = 256
  const faceStartHeight = 768

  const faceSizeWidth =
    script.extendData.faceSizeRect?.[0] ?? script.extendData.faceSize ?? defaultFaceSize
  const faceSizeHeight =
    script.extendData.faceSizeRect?.[1] ?? script.extendData.faceSize ?? defaultFaceSize

  // Grid layout: 4 faces per row, starting at y=768
  const perRow = 4
  const col = faceIndex % perRow
  const row = Math.floor(faceIndex / perRow)

  const offsetX = col * faceSizeWidth
  const offsetY = faceStartHeight + row * faceSizeHeight

  const backgroundPositionX = -offsetX * g.scale
  const backgroundPositionY = -offsetY * g.scale

  // Position on screen
  // Face is positioned relative to the body image
  // bodyTop is 0 (forced), so we just use faceY scaled

  const left = g.bodyLeft + script.faceX * g.scale
  const top = g.bodyTop + script.faceY * g.scale

  return {
    backgroundImage: `url("${assetUrl.value}")`,
    backgroundPosition: `${backgroundPositionX}px ${backgroundPositionY}px`,
    backgroundSize: `${g.renderedWidth}px ${g.imgH * g.scale}px`,
    width: `${faceSizeWidth * g.scale}px`,
    height: `${faceSizeHeight * g.scale}px`,
    left: `${left}px`,
    top: `${top}px`,
    backgroundRepeat: 'no-repeat',
  }
})
</script>

<template>
  <div class="character-container" v-if="scriptData">
    <!-- Body -->
    <div class="character-body" :style="styles.body"></div>
    <!-- Face -->
    <div class="character-face" :style="faceStyles"></div>
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

.character-body {
  position: absolute;
  /* background-size is set inline */
}

.character-face {
  position: absolute;
}
</style>
