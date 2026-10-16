/**
 * A scripted chain behind the watcher's reads, a storage in memory that keeps
 * only what survives a JSON round trip, and an alarm API that records what it
 * was asked.
 */
import { decodeAbiParameters, encodeAbiParameters, getAddress, keccak256, zeroHash } from 'viem'

import type { Account } from '@ambire-common/interfaces/account'
import type {
  ActionState,
  Address,
  AttemptState,
  BlockHeader,
  CancelledBy,
  Hex,
  LogPosition
} from '@web/modules/social-recovery/sdk-interfaces'
import type { AttemptEvents, AttemptScan } from '@web/modules/social-recovery/shared/client/types'
import type { WatcherStorage } from '@web/modules/social-recovery/watcher'

export const SEPOLIA = 11155111
export const ACCOUNT: Address = getAddress('0x00000000000000000000000000000000000a11ce')
export const OTHER_ACCOUNT: Address = getAddress('0x00000000000000000000000000000000000b0b00')
export const BASIC_ACCOUNT: Address = getAddress('0x00000000000000000000000000000000000ba51c')
export const NEW_KEY: Address = getAddress('0x00000000000000000000000000000000000c0ffe')
export const OLD_KEY: Address = getAddress('0x0000000000000000000000000000000000000bad')
export const HEAD = 7_000_000
export const HEAD_TIME = 1_800_000_000
export const COMMITTED_AT = 6_900_000
export const OPENED_BLOCK = 6_950_000
export const OPENED_TIME = 1_799_000_000
export const ENDED_BLOCK = 6_990_000
export const ENDED_TIME = 1_799_900_000
const COMMITMENT: Hex = `0x${'5a'.repeat(32)}`

/** The action's payload of a handover from `OLD_KEY` to `newKey`. */
export const payloadTo = (newKey: Address): Hex =>
  encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [newKey, OLD_KEY])

const positionAt = (blockNumber: number): LogPosition => ({
  blockNumber,
  blockHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
  logIndex: 0,
  transactionHash: `0x${(blockNumber + 1).toString(16).padStart(64, '0')}`,
  removed: false
})

export const startedEvent = (
  attemptId: bigint,
  payload: Hex,
  account: Address = ACCOUNT
): NonNullable<AttemptEvents['started']> => ({
  kind: 'attempt-started',
  account,
  action: getAddress('0x00000000000000000000000000000000000ac710'),
  attemptId,
  setupNonce: 1n,
  setupBody: '0x',
  usedPlaces: [0n],
  usedMethods: [],
  payload,
  order: { token: zeroHash.slice(0, 42) as Address, amount: 0n, payee: OLD_KEY },
  consumableAfter: HEAD_TIME + 3600,
  at: positionAt(OPENED_BLOCK)
})

export const cancelledEvent = (
  attemptId: bigint,
  cancelledBy: CancelledBy
): NonNullable<AttemptEvents['cancelled']> => ({
  kind: 'attempt-cancelled',
  account: ACCOUNT,
  action: getAddress('0x00000000000000000000000000000000000ac710'),
  attemptId,
  canceller: ACCOUNT,
  vetoingMethod: zeroHash.slice(0, 42) as Address,
  cancelledBy,
  setupNonce: 1n,
  usedPlaces: [],
  at: positionAt(ENDED_BLOCK)
})

export const consumedEvent = (attemptId: bigint): NonNullable<AttemptEvents['consumed']> => ({
  kind: 'attempt-consumed',
  account: ACCOUNT,
  action: getAddress('0x00000000000000000000000000000000000ac710'),
  attemptId,
  at: positionAt(ENDED_BLOCK)
})

/** The manager's record of an account with a setup, holding one attempt in `state`. */
export const stateWith = (
  attempt?: {
    attemptId: bigint
    state: AttemptState
    payload?: Hex
    consumableAfter?: number
  },
  setup = true
): ActionState => ({
  setupCommitment: setup ? COMMITMENT : zeroHash,
  setupNonce: 1n,
  nextAttemptId: attempt ? attempt.attemptId + 1n : 1n,
  setupCommittedAtBlock: setup ? COMMITTED_AT : 0,
  attempt: {
    state: attempt?.state ?? 'None',
    attemptId: attempt?.attemptId ?? 0n,
    setupNonce: attempt ? 1n : 0n,
    consumableAfter: attempt?.consumableAfter ?? (attempt ? HEAD_TIME + 3600 : 0),
    payloadHash: attempt?.payload ? keccak256(attempt.payload) : zeroHash,
    order: { token: zeroHash.slice(0, 42) as Address, amount: 0n, payee: OLD_KEY },
    usedMethods: [],
    ignoresPause: true
  }
})

const lower = (address: Address) => address.toLowerCase()

/** A log of an attempt moved to another block. */
export const atBlock = <T extends { at: LogPosition }>(log: T, blockNumber: number): T => ({
  ...log,
  at: { ...log.at, blockNumber }
})

/**
 * A chain the test scripts per account; a read throws where the test set an
 * error for it. Logs set with `setEvents` answer every scan; logs set with
 * `placeEvents` answer only a scan whose blocks hold them.
 */
export const scriptedChain = () => {
  const head: BlockHeader = { number: HEAD, timestamp: HEAD_TIME, hash: zeroHash }
  const states = new Map<string, ActionState | Error>()
  const codes = new Set<string>()
  const unauthorized = new Set<string>()
  const events = new Map<string, AttemptEvents | Error>()
  const placed = new Map<string, AttemptEvents>()
  const times = new Map<number, number>([
    [OPENED_BLOCK, OPENED_TIME],
    [ENDED_BLOCK, ENDED_TIME]
  ])
  const reads = {
    latestBlock: jest.fn(async () => ({ ...head })),
    hasCode: jest.fn<Promise<boolean>, [Address, number]>(async (account) =>
      codes.has(lower(account))
    ),
    stateOf: jest.fn<Promise<ActionState>, [Address, number]>(async (account) => {
      const state = states.get(lower(account)) ?? stateWith(undefined, false)
      if (state instanceof Error) {
        throw state
      }
      return state
    }),
    isAuthorized: jest.fn<Promise<boolean>, [Address, number]>(
      async (account) => !unauthorized.has(lower(account))
    ),
    attemptEventsOf: jest.fn<Promise<AttemptEvents>, [Address, bigint, AttemptScan]>(
      async (account, attemptId, scan) => {
        const held = placed.get(`${lower(account)}:${attemptId}`)
        if (held) {
          const inScan = (log?: { at: LogPosition }) =>
            log && log.at.blockNumber >= scan.from && log.at.blockNumber <= scan.to
              ? log
              : undefined
          const started = inScan(held.started) as AttemptEvents['started']
          // A scan that holds the opening tells no chunk as read.
          if (!started) {
            scan.onChunk?.(scan.from)
          }
          return {
            started,
            cancelled: inScan(held.cancelled) as AttemptEvents['cancelled'],
            consumed: inScan(held.consumed) as AttemptEvents['consumed']
          }
        }
        const found = events.get(`${lower(account)}:${attemptId}`) ?? {}
        if (found instanceof Error) {
          throw found
        }
        return found
      }
    ),
    blockTime: jest.fn(async (block: number) => times.get(block) ?? 0),
    handoverOf: (payload: Hex) => {
      try {
        const [newAuthority, removedAuthority] = decodeAbiParameters(
          [{ type: 'address' }, { type: 'address' }],
          payload
        )
        return { newAuthority, removedAuthority }
      } catch {
        return undefined
      }
    }
  }
  return {
    head,
    reads,
    deploy: (account: Address) => codes.add(lower(account)),
    setState: (account: Address, state: ActionState | Error) => states.set(lower(account), state),
    unauthorize: (account: Address) => unauthorized.add(lower(account)),
    setEvents: (account: Address, attemptId: bigint, found: AttemptEvents | Error) =>
      events.set(`${lower(account)}:${attemptId}`, found),
    placeEvents: (account: Address, attemptId: bigint, found: AttemptEvents) =>
      placed.set(`${lower(account)}:${attemptId}`, found)
  }
}

/** A storage in memory that keeps a value as a JSON round trip would. */
export const memoryStorage = () => {
  const entries = new Map<string, string>()
  const storage: WatcherStorage & { entries: Map<string, string> } = {
    entries,
    get: (async (key: string, defaultValue?: unknown) => {
      const held = entries.get(key)
      return held === undefined ? defaultValue : JSON.parse(held)
    }) as WatcherStorage['get'],
    set: async (key: string, value: unknown) => {
      entries.set(key, JSON.stringify(value))
      return null
    }
  }
  return storage
}

/** An alarm API that records the alarms created and lets the test fire one. */
export const fakeAlarms = () => {
  const listeners: ((alarm: { name: string }) => void)[] = []
  const alarms = {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn((listener: (alarm: { name: string }) => void) => {
        listeners.push(listener)
      }),
      removeListener: jest.fn((listener: (alarm: { name: string }) => void) => {
        listeners.splice(listeners.indexOf(listener), 1)
      })
    }
  }
  return { alarms, fire: (name: string) => listeners.forEach((listener) => listener({ name })) }
}

/** A listed account: a smart account where it has a creation record, a basic one where not. */
export const listed = (addr: Address, smart = true): Account => ({
  addr,
  associatedKeys: [],
  initialPrivileges: [],
  creation: smart
    ? { factoryAddr: `0x${'fa'.repeat(20)}`, bytecode: '0x6000', salt: zeroHash }
    : null,
  preferences: { label: 'Account', pfp: addr }
})

/** Lets every pending promise settle. */
export const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
