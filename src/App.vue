<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { ref, onMounted, onUnmounted, watch } from 'vue'

const route = useRoute()
const wrapperStyle = ref<Record<string, string>>({})

const updateLayout = () => {
  const width = window.innerWidth
  const height = window.innerHeight
  const isPortrait = height > width
  const isPlayer = route.name === 'player'

  const style: Record<string, string> = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transformOrigin: 'center',
    backgroundColor: 'var(--color-background)',
    boxSizing: 'border-box'
  }

  if (isPlayer) {
    // Force Landscape for Player
    style.overflow = 'hidden'
    if (isPortrait) {
      style.width = `${height}px`
      style.height = `${width}px`
      style.transform = 'translate(-50%, -50%) rotate(90deg)'
    } else {
      style.width = `${width}px`
      style.height = `${height}px`
      style.transform = 'translate(-50%, -50%)'
    }
  } else {
    // Normal Layout for Selector/Home
    style.width = '100%'
    style.height = '100%'
    style.transform = 'translate(-50%, -50%)'
    style.overflow = 'auto'
  }

  wrapperStyle.value = style
}

let resizeTimeout: number | null = null
const onResize = () => {
  if (resizeTimeout) window.clearTimeout(resizeTimeout)
  // Immediate update
  updateLayout()
  // Delayed update to catch mobile browser UI changes
  resizeTimeout = window.setTimeout(updateLayout, 300)
}

onMounted(() => {
  updateLayout()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  if (resizeTimeout) window.clearTimeout(resizeTimeout)
})

watch(
  () => route.name,
  () => {
    // Update layout when route changes (e.g. entering/leaving player)
    // Use nextTick or small timeout if needed, but usually immediate is fine for style update
    setTimeout(updateLayout, 50)
  }
)
</script>

<template>
  <div class="app-wrapper" :style="wrapperStyle">
    <RouterView />
  </div>
</template>

<style>
/* Global overrides */
body {
  margin: 0;
  padding: 0;
  overflow: hidden !important;
  background-color: #000;
  display: block !important;
  width: 100vw;
  height: 100vh;
  font-family: sans-serif;
}

#app {
  width: 100%;
  height: 100%;
  padding: 0 !important;
  margin: 0 !important;
  max-width: none !important;
  display: block !important;
}

.app-wrapper {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.app-wrapper::-webkit-scrollbar {
  display: none;
}
</style>
