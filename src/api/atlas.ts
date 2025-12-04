import { ApiConnector, Region, Language, Script } from '@atlasacademy/api-connector'

export { Region }
export type RegionType = Region

export const AssetHost = 'https://static.atlasacademy.io'

const connectors: Partial<Record<Region, ApiConnector>> = {}
const scriptCache = new Map<string, Promise<Script.SvtScript | null>>()

const getConnector = (region: Region) => {
  if (!connectors[region]) {
    connectors[region] = new ApiConnector({
      region,
      language: Language.DEFAULT,
    })
  }
  return connectors[region]!
}

export const getWars = async (region: Region = Region.JP) => {
  const connector = getConnector(region)
  return connector.warList()
}

export const getQuest = async (questId: number, region: Region = Region.JP) => {
  const connector = getConnector(region)
  return connector.quest(questId)
}

export const getWar = async (warId: number, region: Region = Region.JP) => {
  const connector = getConnector(region)
  return connector.war(warId)
}

export const getSvtScript = (charaId: number, region: Region = Region.JP): Promise<Script.SvtScript | null> => {
  const key = `${region}_${charaId}`
  if (scriptCache.has(key)) {
    return scriptCache.get(key)!
  }

  const promise = (async () => {
    const connector = getConnector(region)
    const scripts = await connector.svtScript([charaId])
    return scripts.length > 0 ? scripts[0]! : null
  })()

  scriptCache.set(key, promise)
  return promise
}
