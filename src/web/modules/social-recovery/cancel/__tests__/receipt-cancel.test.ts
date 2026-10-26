/**
 * The owner's cancel read from a landed receipt's own logs, decoded by the
 * SDK's event manager. The logs are encoded here from the event's signature.
 */
import {
  encodeAbiParameters,
  encodeEventTopics,
  getAddress,
  type Hex,
  parseAbi,
  parseAbiParameters,
  zeroAddress
} from 'viem'

import { EventManager } from '@kohaku-eth/social-recovery'
import type { Address, IProvider } from '@kohaku-eth/social-recovery'
import { ownerCancelOf } from '@web/modules/social-recovery/cancel'
import type { ReceiptLog } from '@web/modules/social-recovery/cancel'
import type { CancelLogOptions } from '@web/modules/social-recovery/cancel/__fixtures__/types'
import { deploymentDescriptor } from '@web/modules/social-recovery/shared/client'

const MANAGER: Address = getAddress('0x734b9aa580d4a184ea129e791c4c9fb8734b3ac6')
const ACCOUNT: Address = getAddress('0xabcdef0123456789abcdef0123456789abcdef01')
const ACTION: Address = getAddress('0x6666666666666666666666666666666666666666')
const OTHER: Address = getAddress('0x9999999999999999999999999999999999999999')
const TX: Hex = `0x${'ab'.repeat(32)}`
const BLOCK_HASH: Hex = `0x${'cd'.repeat(32)}`

const CANCELLED = parseAbi([
  'event AttemptCancelled(address indexed account, address indexed action, uint64 attemptId, address canceller, address stoppedMethod, uint64 setupNonce, uint256[] usedPlaces)'
])

const cancelLog = (
  attemptId: bigint,
  { emitter = MANAGER, canceller = ACCOUNT, usedPlaces = [] }: CancelLogOptions = {}
): ReceiptLog => ({
  address: emitter,
  topics: encodeEventTopics({
    abi: CANCELLED,
    eventName: 'AttemptCancelled',
    args: { account: ACCOUNT, action: ACTION }
  }) as Hex[],
  data: encodeAbiParameters(parseAbiParameters('uint64, address, address, uint64, uint256[]'), [
    attemptId,
    canceller,
    zeroAddress,
    1n,
    usedPlaces
  ]),
  blockNumber: 100,
  blockHash: BLOCK_HASH,
  index: 0,
  transactionHash: TX,
  removed: false
})

// Only the feed's decoding is used: it reads nothing through its provider.
const events = new EventManager(
  {} as IProvider,
  { ...deploymentDescriptor('sepolia'), manager: MANAGER, action: ACTION },
  ACCOUNT,
  ACTION,
  new Map(),
  { logChunkSize: 1000 }
)

const find = (logs: ReceiptLog[]) =>
  ownerCancelOf({ logs, transactionHash: TX, events, account: ACCOUNT, action: ACTION })

describe("the owner's cancel in a receipt's logs", () => {
  it('names the attempt the cancel ended, whatever its id', () => {
    const found = find([cancelLog(41n)])

    expect(found?.attemptId).toBe(41n)
    expect(found?.cancelledBy).toBe('cancelByOwner')
    expect(found?.at.blockNumber).toBe(100)
  })

  it("finds none in a log another contract emitted, or in a cancel that was not the owner's", () => {
    expect(find([cancelLog(41n, { emitter: OTHER })])).toBeUndefined()
    // The guardians' cancel and a setup write's cancel.
    expect(find([cancelLog(41n, { canceller: OTHER, usedPlaces: [1n] })])).toBeUndefined()
    expect(find([cancelLog(41n, { canceller: zeroAddress })])).toBeUndefined()
    expect(find([])).toBeUndefined()
  })

  it('skips a log a reorg removed and a log that is not hex', () => {
    expect(find([{ ...cancelLog(41n), removed: true }])).toBeUndefined()
    expect(find([{ ...cancelLog(41n), data: 'not hex' }, cancelLog(42n)])?.attemptId).toBe(42n)
  })

  it("takes only a log of the receipt's own transaction", () => {
    const other: Hex = `0x${'ef'.repeat(32)}`
    expect(find([{ ...cancelLog(41n), transactionHash: other }])).toBeUndefined()
    expect(find([{ ...cancelLog(41n), transactionHash: other }, cancelLog(42n)])?.attemptId).toBe(
      42n
    )
    expect(
      find([{ ...cancelLog(43n), transactionHash: TX.toUpperCase().replace('0X', '0x') }])
        ?.attemptId
    ).toBe(43n)
  })
})
