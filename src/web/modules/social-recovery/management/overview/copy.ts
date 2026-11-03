/**
 * The overview's own words over the shared write states: a write that may
 * still land carries the overview's one line in place of the shared one.
 * Every other reading keeps the shared copy, which names no save.
 */
import { mayStillLand } from '@web/modules/social-recovery/shared/writes'
import type { WriteState } from '@web/modules/social-recovery/shared/writes'
import type { SaveWriteKeys } from '@web/modules/social-recovery/setup/arm'

import { OVERVIEW } from './constants'

export const overviewWriteKeysOf = (state: WriteState): SaveWriteKeys =>
  state.status === 'failedNotSent' && mayStillLand(state)
    ? { body: `${OVERVIEW}.writes.mayStillLand` }
    : {}
