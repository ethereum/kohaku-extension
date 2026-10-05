/**
 * The records' default storage: the extension's own helper over
 * `browser.storage.local`. No controller and no background message.
 * `getAll` is the helper's `get()` with no key, which returns every entry.
 */
import { get, remove, set } from '@web/extension-services/background/webapi/storage'

import type { RecordStorage } from './types'

export const extensionRecordStorage: RecordStorage = {
  get,
  set,
  remove,
  getAll: async () => (await get()) as Record<string, unknown>
}
