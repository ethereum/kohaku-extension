import { parse, stringify } from '@ambire-common/libs/richJson/richJson'

import type { RichJsonStorageDouble } from '@web/modules/social-recovery/shared/records/__fixtures__/types'

// The helper's `formatValue`: parse a string, or return it as is when it is not JSON.
const formatValue = (stored: string): unknown => {
  try {
    return parse(stored)
  } catch (error) {
    return stored
  }
}

/**
 * An in-memory double of src/web/extension-services/background/webapi/storage.ts
 * that behaves like it: `set` stores the rich JSON string of a non-string value,
 * and `get` returns the default when the stored string is falsy and parses it
 * otherwise. So a field holding `undefined` loses its key and a `bigint`
 * survives, as in the extension.
 */
export const makeStorage = (): RichJsonStorageDouble => {
  const raw = new Map<string, string>()
  const calls = {
    set: [] as string[],
    remove: [] as string[],
    setEntries: [] as string[][],
    removeKeys: [] as string[][]
  }
  const faults: RichJsonStorageDouble['faults'] = {}
  // The helper's serialization: a string as is, anything else through richJson.
  // `browser.storage.local.set({ [key]: undefined })` stores nothing.
  const serialize = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : stringify(value)
  const set = async (key: string, value: unknown): Promise<null> => {
    calls.set.push(key)
    const serialized = serialize(value)
    if (serialized !== undefined) {
      raw.set(key, serialized)
    }
    return null
  }
  const remove = async (key: string): Promise<null> => {
    calls.remove.push(key)
    raw.delete(key)
    return null
  }
  // One `browser.storage.local` call over several keys lands whole or not at
  // all: every value is serialized first, and an injected fault stores nothing.
  const takeFault = (name: keyof RichJsonStorageDouble['faults']) => {
    const fault = faults[name]
    delete faults[name]
    if (fault) {
      throw fault
    }
  }
  return {
    raw,
    calls,
    faults,
    // The helper's rule: `if (!res[key]) return defaultValue`, then `formatValue`.
    get: async (key, defaultValue) => {
      const stored = key && raw.get(key)
      if (!stored) {
        return defaultValue
      }
      return formatValue(stored)
    },
    getAll: async () =>
      Object.fromEntries([...raw.entries()].map(([key, stored]) => [key, formatValue(stored)])),
    set,
    remove,
    setEntries: async (entries) => {
      calls.setEntries.push(Object.keys(entries))
      takeFault('setEntries')
      const serialized = Object.entries(entries).map(([key, value]) => [key, serialize(value)])
      serialized.forEach(([key, value]) => {
        if (value !== undefined) {
          raw.set(key as string, value)
        }
      })
    },
    removeKeys: async (keys) => {
      calls.removeKeys.push([...keys])
      takeFault('removeKeys')
      keys.forEach((key) => raw.delete(key))
    }
  }
}
