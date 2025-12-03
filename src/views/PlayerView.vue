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
  const phase = Number(route.params.phase)
  const scriptIdx = Number(route.params.scriptIdx)

  if (questId) {
    if (!store.currentQuest || store.currentQuest.id !== questId) {
      await store.fetchQuest(questId)
    }

    if (store.currentQuest) {
      // Pass the specific phase and script index
      await player.loadScript(store.currentQuest, store.region, phase, scriptIdx)
    }
  }
}

onMounted(() => {
  loadScript()
})

watch(
  () => [route.params.questId, route.params.phase, route.params.scriptIdx],
  () => {
    loadScript()
  },
)

// Watch for script finish to navigate to next
watch(
  () => player.state.value.isFinished,
  (finished) => {
    if (finished) {
      handleScriptFinished()
    }
  }
)

const handleScriptFinished = () => {
  if (!store.currentQuest) return

  const currentPhase = Number(route.params.phase)
  const currentScriptIdx = Number(route.params.scriptIdx)

  // Check if there is a next script in the current phase
  const phaseData = store.currentQuest.phaseScripts.find(p => p.phase === currentPhase)
  if (phaseData && phaseData.scripts && currentScriptIdx + 1 < phaseData.scripts.length) {
    // Go to next script in same phase
    router.push({
      name: 'player',
      params: {
        questId: store.currentQuest.id,
        phase: currentPhase,
        scriptIdx: currentScriptIdx + 1
      }
    })
    return
  }

  // Check for next phase
  // We need to find the next available phase number
  const phases = store.currentQuest.phaseScripts.map(p => p.phase).sort((a, b) => a - b)
  const nextPhaseIndex = phases.indexOf(currentPhase) + 1

  if (nextPhaseIndex < phases.length) {
    const nextPhase = phases[nextPhaseIndex]
    // Go to first script of next phase
    router.push({
      name: 'player',
      params: {
        questId: store.currentQuest.id,
        phase: nextPhase,
        scriptIdx: 0
      }
    })
    return
  }

  // No more scripts/phases
  alert('Quest Completed!')
  router.push({ name: 'home' })
}

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
          <div class="info">
            Phase: {{ route.params.phase }} | Script: {{ route.params.scriptIdx }}
          </div>
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
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

.background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  user-select: none;
  -webkit-user-drag: none;
}

.characters {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 2;
  pointer-events: none;
}

.ui-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
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
  user-select: none;
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
  z-index: 1000;
}

.info {
  margin-top: 5px;
  font-size: 0.8em;
}

button {
  padding: 5px 10px;
  background: #4a90e2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background: #357abd;
}

.loading,
.error {
  font-size: 1.5em;
}

.error {
  color: #d32f2f;
}
</style>
