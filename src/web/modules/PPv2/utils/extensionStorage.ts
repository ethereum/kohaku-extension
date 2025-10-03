export const storeData = async ({ key, data }: { key: string; data: string }) => {
  await chrome.storage.local.set({ [key]: data })
}

export const getData = async ({ key }: { key: string }) => {
  const result = await chrome.storage.local.get(key)
  return result[key]
}
