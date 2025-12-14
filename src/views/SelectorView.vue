<template>
  <div class="selector-container" ref="containerRef">
    <div class="header">
      <h1>FGO Story Player</h1>
      <div class="region-selector">
        <label>Region:</label>
        <select v-model="selectedRegion" @change="handleRegionChange">
          <option v-for="r in Region" :key="r" :value="r">{{ r }}</option>
        </select>
      </div>
    </div>

    <div v-if="store.isLoading" class="loading">Loading...</div>
    <div v-if="store.error" class="error">{{ store.error }}</div>

    <div class="content">
      <!-- War List -->
      <div class="column war-list" v-if="!store.currentWarId">
        <h2>Chapters</h2>
        <ul>
          <li v-for="war in store.wars" :key="war.id" @click="selectWar(war.id)" class="war-item">
            {{ war.name }} ({{ war.id }})
          </li>
        </ul>
      </div>

      <!-- Quest List (Categorized by type) -->
      <div class="column quest-list" v-else>
        <button @click="backToWars">Back to Chapters</button>
        <h2 v-if="store.currentWar">{{ store.currentWar.name }}</h2>

        <div v-if="store.currentWar">
          <!-- Group all quests by type, ignore spots -->
          <div v-for="[type, quests] in getAllQuestsByType()" :key="type" class="quest-type-group">
            <h3 class="quest-type-header">{{ getQuestTypeLabel(type) }}</h3>
            <ul>
              <li
                v-for="quest in quests"
                :key="quest.id"
                class="quest-item"
              >
                <div class="quest-header" @click="toggleQuest(quest.id)">
                  <span class="quest-name">{{ quest.name }}</span>
                  <span class="quest-id">(ID: {{ quest.id }})</span>
                  <span class="expand-icon">{{ store.expandedQuestId === quest.id ? '▼' : '▶' }}</span>
                </div>

                <!-- Show phases and scripts when expanded -->
                <div v-if="store.expandedQuestId === quest.id" class="quest-details">
                  <div v-if="quest.phaseScripts && quest.phaseScripts.length > 0">
                    <div v-for="phaseScript in quest.phaseScripts" :key="phaseScript.phase" class="phase-group">
                      <div class="phase-header">Phase {{ phaseScript.phase }}</div>
                      <ul class="script-list">
                        <li
                          v-for="(script, idx) in phaseScript.scripts"
                          :key="script.scriptId"
                          @click="playScript(quest.id, phaseScript.phase, idx)"
                          class="script-item"
                        >
                          Script {{ idx + 1 }}: {{ script.scriptId }}
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div v-else class="no-scripts">
                    No scripts available for this quest
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useFgoStore } from '@/stores/fgo'
import { Region, type RegionType } from '@/api/atlas'
import { useRouter } from 'vue-router'
import type { Quest } from '@atlasacademy/api-connector'

const store = useFgoStore()
const router = useRouter()
const selectedRegion = ref<RegionType>(store.region)

const containerRef = ref<HTMLElement | null>(null)

watch(() => store.currentWarId, () => {
  if (containerRef.value) {
    containerRef.value.scrollTop = 0
  }
})

onMounted(() => {
  if (store.wars.length === 0) {
    store.fetchWars()
  }
})

const handleRegionChange = () => {
  store.setRegion(selectedRegion.value)
}

const selectWar = (warId: number) => {
  store.fetchWar(warId)
}

const backToWars = () => {
  store.currentWarId = null
  store.currentWar = null
}

const toggleQuest = (questId: number) => {
  if (store.expandedQuestId === questId) {
    store.expandedQuestId = null
  } else {
    store.expandedQuestId = questId
  }
}

const playScript = (questId: number, phase: number, scriptIdx: number) => {
  router.push({
    name: 'player',
    params: {
      questId: questId.toString(),
      phase: phase.toString(),
      scriptIdx: scriptIdx.toString()
    }
  })
}

// Collect all quests from all spots and group by type
const getAllQuestsByType = () => {
  if (!store.currentWar) return new Map()

  // Collect all quests from all spots
  const allQuests: Quest.Quest[] = []
  store.currentWar.spots.forEach(spot => {
    allQuests.push(...spot.quests)
  })

  return getQuestsByType(allQuests)
}

// Group quests by type and sort by ID
const getQuestsByType = (quests: Quest.Quest[]) => {
  const grouped = new Map<string, Quest.Quest[]>()

  quests.forEach(quest => {
    if (!grouped.has(quest.type)) {
      grouped.set(quest.type, [])
    }
    grouped.get(quest.type)!.push(quest)
  })

  // Sort quests within each type by ID
  grouped.forEach(questList => {
    questList.sort((a, b) => a.id - b.id)
  })

  // Sort types by priority (main first, then others alphabetically)
  const sortedEntries = Array.from(grouped.entries()).sort((a, b) => {
    const typeOrder: Record<string, number> = {
      'main': 0,
      'free': 1,
      'friendship': 2,
      'event': 3,
      'heroballad': 4
    }

    const orderA = typeOrder[a[0]] ?? 99
    const orderB = typeOrder[b[0]] ?? 99

    if (orderA !== orderB) return orderA - orderB
    return a[0].localeCompare(b[0])
  })

  return sortedEntries
}

const getQuestTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    'main': 'Main Story',
    'free': 'Free Quest',
    'friendship': 'Interlude',
    'event': 'Event',
    'heroballad': 'Hero Ballad',
    'warBoard': 'War Board',
    'autoExecute': 'Auto Execute'
  }

  return labels[type] || type
}
</script>

<style scoped>
.selector-container {
  padding: 20px;
  max-width: 1000px;
  margin: 0 auto;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.region-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.war-item {
  cursor: pointer;
  padding: 10px;
  border: 1px solid var(--color-border);
  margin-bottom: 5px;
  border-radius: 4px;
  transition: background-color 0.2s;
  background-color: var(--color-background);
}

.war-item:hover {
  background-color: var(--color-background-soft);
}

.quest-type-group {
  margin-bottom: 30px;
  padding: 15px;
  background-color: var(--color-background-soft);
  border-radius: 8px;
  border: 1px solid var(--color-border);
}

.quest-type-header {
  color: #4a90e2;
  font-size: 1.2em;
  margin-bottom: 15px;
  padding: 10px;
  background-color: var(--color-background);
  border-radius: 4px;
  border-left: 4px solid #4a90e2;
}

.quest-item {
  margin-bottom: 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  overflow: hidden;
  background-color: var(--color-background);
}

.quest-header {
  cursor: pointer;
  padding: 10px;
  background-color: var(--color-background-soft);
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.2s;
}

.quest-header:hover {
  background-color: var(--color-background-mute);
}

.quest-name {
  font-weight: 500;
  flex: 1;
}

.quest-id {
  color: var(--color-text);
  opacity: 0.7;
  font-size: 0.9em;
  margin-left: 10px;
}

.expand-icon {
  margin-left: 10px;
  color: #4a90e2;
  font-size: 0.8em;
}

.quest-details {
  padding: 10px;
  background-color: var(--color-background);
  border-top: 1px solid var(--color-border);
}

.phase-group {
  margin-bottom: 15px;
}

.phase-header {
  font-weight: bold;
  color: var(--color-text);
  opacity: 0.8;
  margin-bottom: 8px;
  font-size: 0.95em;
}

.script-list {
  list-style: none;
  padding-left: 20px;
}

.script-item {
  cursor: pointer;
  padding: 8px 12px;
  margin-bottom: 5px;
  background-color: var(--color-background-mute);
  border-radius: 4px;
  border: 1px solid var(--color-border);
  transition: all 0.2s;
  font-size: 0.9em;
}

.script-item:hover {
  background-color: #4a90e2;
  color: white;
  border-color: #4a90e2;
}

.no-scripts {
  color: var(--color-text);
  opacity: 0.5;
  font-style: italic;
  padding: 10px;
}

button {
  padding: 8px 16px;
  margin-bottom: 15px;
  background-color: #4a90e2;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:hover {
  background-color: #357abd;
}

.loading,
.error {
  text-align: center;
  padding: 20px;
  font-size: 1.1em;
}

.error {
  color: #d32f2f;
}
</style>
