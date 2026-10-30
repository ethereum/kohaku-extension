/**
 * The records' default storage: the extension's own helper over
 * `browser.storage.local`. No controller and no background message.
 * `getAll` is the helper's `get()` with no key, which returns every entry.
 * The helper writes and removes one key per call, so `setEntries` and
 * `removeKeys` pass several keys to `browser.storage.local` in one call,
 * serialized as the helper's `set` does.
 */
import { stringify } from '@ambire-common/libs/richJson/richJson'
import { browser } from '@web/constants/browserapi'
import { get, remove, set } from '@web/extension-services/background/webapi/storage'

import type { RecordStorage } from './types'

export const extensionRecordStorage: RecordStorage = {
  get,
  set,
  remove,
  getAll: async () => (await get()) as Record<string, unknown>,
  setEntries: async (entries) => {
    await browser.storage.local.set(
      Object.fromEntries(
        Object.entries(entries).map(([key, value]) => [
          key,
          typeof value === 'string' ? value : stringify(value)
        ])
      )
    )
  },
  removeKeys: async (keys) => {
    await browser.storage.local.remove(keys)
  }
}
