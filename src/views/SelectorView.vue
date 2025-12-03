<template>
  <div class="selector-container">
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

      <!-- Quest List (Spots -> Quests) -->
      <div class="column quest-list" v-else>
        <button @click="backToWars">Back to Chapters</button>
        <h2 v-if="store.currentWar">{{ store.currentWar.name }}</h2>

        <div v-if="store.currentWar">
          <div v-for="spot in store.currentWar.spots" :key="spot.id" class="spot-item">
            <h3>{{ spot.name }}</h3>
            <ul>
              <li
                v-for="quest in spot.quests"
                :key="quest.id"
                @click="playQuest(quest.id)"
                class="quest-item"
              >
                {{ quest.name }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useFgoStore } from '@/stores/fgo'
import { Region, type RegionType } from '@/api/atlas'
import { useRouter } from 'vue-router'

const store = useFgoStore()
const router = useRouter()
const selectedRegion = ref<RegionType>(store.region)

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

const playQuest = (questId: number) => {
  router.push({ name: 'player', params: { questId } })
}
</script>

<style scoped>
.selector-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.war-item,
.quest-item {
  cursor: pointer;
  padding: 10px;
  border: 1px solid #ddd;
  margin-bottom: 5px;
  border-radius: 4px;
}

.war-item:hover,
.quest-item:hover {
  background-color: #f0f0f0;
}

.spot-item {
  margin-top: 20px;
}
</style>
