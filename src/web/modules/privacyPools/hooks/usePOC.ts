import { useCallback } from 'react'

export const usePOC = () => {
  const PRIVACY_POOLS_KEY = 'privacy-pools-mnemonic'

  const storeData = useCallback(async (data: string) => {
    await chrome.storage.local.set({ [PRIVACY_POOLS_KEY]: data })
  }, [])

  const getData = useCallback(async () => {
    const result = await chrome.storage.local.get(PRIVACY_POOLS_KEY)
    return result[PRIVACY_POOLS_KEY]
  }, [])

  return {
    storeData,
    getData
  }
}
