import { ref, computed } from 'vue'
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
  const region = ref<RegionType>(Region.JP)
  const wars = ref<WarSchema.WarBasic[]>([])
  const currentWarId = ref<number | null>(null)
  const currentWar = ref<WarSchema.War | null>(null)
  const currentQuestId = ref<number | null>(null)
  const currentQuest = ref<QuestWithScripts | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

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
