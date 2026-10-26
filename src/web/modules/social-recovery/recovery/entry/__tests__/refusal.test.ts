/**
 * The account step after the confirmation refuses the account being recovered
 * as the account that receives its control, on the key's own step and before
 * the reads of the key it would install; another receiving account goes on.
 */
import type { Address } from '@kohaku-eth/social-recovery'
import { confirmedStepOf } from '@web/modules/social-recovery/recovery/entry'
import type { ConfirmedReads } from '@web/modules/social-recovery/recovery/entry/types'

const LOST: Address = '0x1057000000000000000000000000000000000005'
const LOST_KEY: Address = '0xdead000000000000000000000000000000000006'
const OTHER: Address = '0x00000000000000000000000000000000000a11ce'

const reads = (destination?: ConfirmedReads['destination']): ConfirmedReads => ({
  authorization: { status: 'answered', value: true },
  fit: {
    status: 'answered',
    value: {
      supportsAccount: true,
      fitCheck: { basis: 'deployed-code', fits: true },
      removedKey: { kind: 'named', key: LOST_KEY },
      removedKeyIsAuthority: true
    }
  },
  ...(destination ? { destination } : {})
})

describe('the account that receives control', () => {
  it('refuses the account being recovered before the key reads answer', () => {
    expect(
      confirmedStepOf(reads(), LOST_KEY, {
        confirmed: LOST,
        receiving: LOST
      })
    ).toEqual({ kind: 'destination', refusal: 'same-account' })
  })

  it('goes on to the key reads for another account', () => {
    expect(confirmedStepOf(reads(), OTHER, { confirmed: LOST, receiving: OTHER })).toEqual({
      kind: 'reading',
      stage: 'destination'
    })
    expect(
      confirmedStepOf(
        reads({ status: 'answered', value: { isAuthority: false, holdsAnyPrivilege: false } }),
        OTHER,
        { confirmed: LOST, receiving: OTHER }
      )
    ).toEqual({ kind: 'ready' })
  })
})
