import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { getWars, getWar, getQuest, type RegionType, Region } from '@/api/atlas'
import type { War as WarSchema, Quest as QuestSchema } from '@atlasacademy/api-connector'

// Type for quest with processed script information
export interface QuestWithScripts extends QuestSchema.Quest {
  phaseScripts: Array<{
    phase: number
    scripts: Array<{
      scriptId: string
      script: string
    }>
  }>
}

export const useFgoStore = defineStore('fgo', () => {
  const savedRegion = localStorage.getItem('fgo-region') as RegionType | null
  const region = ref<RegionType>(savedRegion || Region.JP)

  watch(region, (newRegion) => {
    localStorage.setItem('fgo-region', newRegion)
  })

  const wars = ref<WarSchema.WarBasic[]>([])
  const savedWarId = localStorage.getItem('fgo-war-id')
  const currentWarId = ref<number | null>(savedWarId ? Number(savedWarId) : null)
  const currentWar = ref<WarSchema.War | null>(null)
  const currentQuestId = ref<number | null>(null)
  const currentQuest = ref<QuestWithScripts | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  watch(currentWarId, (newWarId) => {
    if (newWarId) {
      localStorage.setItem('fgo-war-id', newWarId.toString())
    } else {
      localStorage.removeItem('fgo-war-id')
    }
  })

  const fetchWars = async () => {
    isLoading.value = true
    error.value = null
    try {
      wars.value = await getWars(region.value)
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch wars'
    } finally {
      isLoading.value = false
    }
  }

  const fetchWar = async (warId: number) => {
    isLoading.value = true
    error.value = null
    try {
      currentWar.value = await getWar(warId, region.value)
      currentWarId.value = warId
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch war'
    } finally {
      isLoading.value = false
    }
  }

  // Restore war if saved
  if (currentWarId.value) {
    fetchWar(currentWarId.value)
  }


  const fetchQuest = async (questId: number) => {
    isLoading.value = true
    error.value = null
    try {
      const quest = await getQuest(questId, region.value)
      currentQuest.value = quest as QuestWithScripts
      currentQuestId.value = questId
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch quest'
    } finally {
      isLoading.value = false
    }
  }

  const setRegion = (newRegion: RegionType) => {
    region.value = newRegion
    wars.value = []
    currentWarId.value = null
    currentWar.value = null
    currentQuestId.value = null
    currentQuest.value = null
    fetchWars()
  }

  return {
    region,
    wars,
    currentWarId,
    currentWar,
    currentQuestId,
    currentQuest,
    isLoading,
    error,
    fetchWars,
    fetchWar,
    fetchQuest,
    setRegion,
  }
})
