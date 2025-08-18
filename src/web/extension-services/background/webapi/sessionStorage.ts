import { Storage } from '@ambire-common/interfaces/storage'
import { parse, stringify } from '@ambire-common/libs/richJson/richJson'
import { browser, isExtension } from '@web/constants/browserapi'

const benzinStorage = {
  get: (key: string, defaultValue: any): any => {
    const serialized = sessionStorage.getItem(key)
    return Promise.resolve(serialized ? parse(serialized) : defaultValue)
  },
  set: (key: string, value: any) => {
    sessionStorage.setItem(key, stringify(value))
    return Promise.resolve(null)
  },
  remove: (key: string) => {
    sessionStorage.removeItem(key)
    return Promise.resolve(null)
  }
}

const formatValue = (value: any, defaultValue?: any) => {
  try {
    return typeof value === 'string' ? parse(value) : value
  } catch (error) {
    return typeof value === 'string' ? value : defaultValue
  }
}

export const get = async (key?: string, defaultValue?: any) => {
  const res = await browser.storage.session.get(null)

  if (!key) {
    return Object.fromEntries(Object.entries(res).map(([k, value]) => [k, formatValue(value)]))
  }

  if (!res[key]) return defaultValue

  return formatValue(res[key])
}

export const set = async (key: string, value: any): Promise<null> => {
  await browser.storage.session.set({
    [key]: typeof value === 'string' ? value : stringify(value)
  })
  return null
}

export const remove = async (key: string): Promise<null> => {
  await browser.storage.session.remove([key])
  return null
}

export const storage: Storage = isExtension ? { get, set, remove } : benzinStorage

export default {
  get,
  set,
  remove,
  storage
}
