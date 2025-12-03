<script setup lang="ts">
import { onMounted, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFgoStore } from '@/stores/fgo'
import { useScriptPlayer } from '@/composables/useScriptPlayer'
import Character from '@/components/Character.vue'

const route = useRoute()
const router = useRouter()
const store = useFgoStore()
const player = useScriptPlayer()
const debugMode = ref(true)

const loadScript = async () => {
  const questId = Number(route.params.questId)
  if (questId) {
    await store.fetchQuest(questId)
    if (store.currentQuest) {
      // Pass the whole quest object and region
      player.loadScript(store.currentQuest, store.region)
    }
  }
}

onMounted(() => {
  loadScript()
})

watch(
  () => route.params.questId,
  () => {
    loadScript()
  },
)

const exit = () => {
  router.push({ name: 'home' })
}
</script>

<template>
  <div class="player-container">
    <div v-if="store.isLoading" class="loading">Loading Script...</div>
    <div v-else-if="store.error" class="error">{{ store.error }}</div>
    <div v-else-if="store.currentQuest" class="game-screen" @click="player.next()">
      <!-- Background Layer -->
      <div
        class="background"
        :style="{
          backgroundImage: player.state.value.background
            ? `url(${player.state.value.background})`
            : 'none',
        }"
      >
        <!-- TODO: Background Component -->
      </div>

      <!-- Character Layer -->
      <div class="characters">
        <Character
          v-if="player.state.value.activeCharacter"
          :charaGraphId="player.state.value.activeCharacter.id"
          :face="player.state.value.activeCharacter.face"
          :region="store.region"
        />
      </div>

      <!-- UI Layer -->
      <div class="ui-layer">
        <div class="dialog-box" v-if="player.state.value.text">
          <div class="speaker" v-if="player.state.value.speaker">
            {{ player.state.value.speaker }}
          </div>
          <div class="text">{{ player.state.value.text }}</div>
        </div>

        <div class="debug-overlay" v-if="debugMode">
          <button @click.stop="exit">Exit</button>
          <details>
            <summary>Quest Data (Debug)</summary>
            <pre>{{ store.currentQuest }}</pre>
          </details>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-container {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  width: 100vw;
  height: 100vh;
  background: #000;
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
}

.game-screen {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 1024px;
  max-height: 626px;
  background: #333;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 1024 / 626;
}

.background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.ui-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none; /* Allow clicks to pass through to game-screen */
}

.ui-layer > * {
  pointer-events: auto;
}

.dialog-box {
  position: absolute;
  bottom: 0;
  width: 100%;
  height: 150px;
  background: rgba(0, 0, 0, 0.8);
  padding: 20px;
  box-sizing: border-box;
}

.speaker {
  font-weight: bold;
  font-size: 1.2em;
  margin-bottom: 10px;
  color: #ffcc00;
}

.text {
  font-size: 1.1em;
  line-height: 1.5;
}

.debug-overlay {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.5);
  padding: 10px;
  max-width: 300px;
  max-height: 80%;
  overflow: auto;
  z-index: 1000;
}

pre {
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
