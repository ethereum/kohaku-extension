import { AccountPreferences } from '@ambire-common/interfaces/account'

export interface ExtendedAccountPreferences extends AccountPreferences {
  pinnedAt?: number // Unix timestamp; undefined/0 = unpinned
}
