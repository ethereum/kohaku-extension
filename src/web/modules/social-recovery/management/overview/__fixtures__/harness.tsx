/**
 * Mounts the overview's view in jsdom with the light theme, over given reads
 * or over the overview's own reads hook on a client built over the stand-in's
 * fake node, with real records on an in-memory storage. The write step's
 * edges are fakes: the gas reads, the receipt waits and a send port whose
 * batch changes the scripted chain as the landed write would. jsdom has no
 * `TextEncoder`, which viem reads when it loads, so the harness sets Node's
 * before it loads the modules.
 */
import { webcrypto } from 'crypto'
import { TextDecoder, TextEncoder } from 'util'

import type { Account } from '@ambire-common/interfaces/account'
import type {
  OverviewIntent,
  OverviewReads,
  OverviewViewProps
} from '@web/modules/social-recovery/management/overview/types'
import type { Address, Configuration, Hex, SetupState } from '@kohaku-eth/social-recovery'
import type {
  ChainReads,
  KeyHandle,
  RecoveryKitClient
} from '@web/modules/social-recovery/shared/client'
import type { RecordStorage } from '@web/modules/social-recovery/shared/records'
import type { OfferedLevel } from '@web/modules/social-recovery/setup/privacy/types'

import type {
  AdvancingFakeTimers,
  ClientState,
  ReadsProbeProps,
  StepReceipts,
  StepSendPort,
  World
} from './types'

Object.assign(globalThis, { TextEncoder, TextDecoder })
// The fake node seals a backup with WebCrypto, which jsdom does not carry.
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })

// The stand-in's chain answers the overview's client; no deployment variable
// from a developer's environment turns it into the deployed kit.
jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  SEPOLIA_DEPLOYMENT_VARIABLE: 'SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT',
  sepoliaDeploymentVariable: () => undefined
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const { getAddress }: typeof import('viem') = require('viem')
const {
  walletMethod
}: typeof import('@kohaku-eth/social-recovery') = require('@kohaku-eth/social-recovery')
const {
  privacyOfLevel
}: typeof import('@web/modules/social-recovery/setup/privacy/writes') = require('@web/modules/social-recovery/setup/privacy/writes')
const cancelMount: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const {
  addressBookOf,
  buildRecoveryClient,
  CHAIN_IDS,
  descriptorOf,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  sdkStandIn
}: typeof import('@web/modules/social-recovery/shared/client/stand-in') = require('@web/modules/social-recovery/shared/client/stand-in')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  makeStorage
}: typeof import('@web/modules/social-recovery/shared/records/__fixtures__/storage') = require('@web/modules/social-recovery/shared/records/__fixtures__/storage')
const OverviewView: typeof import('@web/modules/social-recovery/management/overview/OverviewView').default =
  require('@web/modules/social-recovery/management/overview/OverviewView').default
const {
  useOverviewReads
}: typeof import('@web/modules/social-recovery/management/overview/useOverviewReads') = require('@web/modules/social-recovery/management/overview/useOverviewReads')
const {
  attemptOpenOf
}: typeof import('@web/modules/social-recovery/management/overview/readings') = require('@web/modules/social-recovery/management/overview/readings')
const {
  requestIdOf
}: typeof import('@web/modules/social-recovery/shared/writes') = require('@web/modules/social-recovery/shared/writes')
const {
  REMOVAL_DRAFT
}: typeof import('@web/modules/social-recovery/management/overview/constants') = require('@web/modules/social-recovery/management/overview/constants')
const armHarness: typeof import('@web/modules/social-recovery/setup/arm/__tests__/harness') = require('@web/modules/social-recovery/setup/arm/__tests__/harness')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

export const { mount, t, act, settle } = cancelMount

export const ADDRESS_BOOK = addressBookOf(WALLET_RECOVERY_CHAIN)
export const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
export const ACCOUNT = '0x00000000000000000000000000000000000A11cE' as const
export const GUARDIAN = '0x00000000000000000000000000000000000B0b00' as const
export const HASH = `0x${'11'.repeat(32)}` as const
export const PASSWORD = 'card password'

// Checksummed, as the SDK opens a method address from a backup.
export const CONFIGURATION: Configuration = {
  clauses: [
    {
      threshold: 1,
      credentials: [
        {
          method: getAddress(ADDRESS_BOOK.methods.ecdsa),
          config: walletMethod().codec.encodeConfig({ signer: GUARDIAN })
        }
      ]
    }
  ],
  wait: 172_800,
  ignoresPause: true
}

export const CONTEXT: OverviewViewProps['context'] = {
  addressBook: ADDRESS_BOOK,
  ownRpIdHash: HASH
}

/**
 * Settles until the check holds: a sealed backup's open runs its key
 * derivation on the real clock, longer than one settle.
 */
export const settleUntil = async (check: () => boolean, rounds = 100): Promise<void> => {
  for (let round = 0; round < rounds && !check(); round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20)
      })
    })
  }
  await settle()
}

/** Settles until no read or password check on the page is still running. */
export const settleReads = (): Promise<void> =>
  settleUntil(
    () => !document.querySelector('[data-testid$="-reading"], [data-testid$="-checking"]')
  )

/** Types into a field the way a holder does, so React hears the change. */
export const typeInto = async (container: HTMLElement | null, value: string): Promise<void> => {
  const input =
    container instanceof HTMLInputElement ? container : container?.querySelector('input')
  if (!input) {
    throw new Error('no field to type into')
  }
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await settle()
}

/** A setup state with the given fields over a committed, authorized one. */
export const setupStateOf = (fields: Partial<SetupState> = {}): SetupState => ({
  isAuthorized: true,
  hasSetup: true,
  setupCommitment: HASH,
  setupNonce: 1n,
  setupCommittedAtBlock: 100,
  attemptActive: false,
  block: { number: 200, timestamp: 2_000, hash: HASH },
  ...fields
})

/** Reads as the view takes them, each move a mock. */
export const readsOf = (fields: Partial<OverviewReads> = {}): OverviewReads => ({
  facts: { status: 'pending' },
  path: { kind: 'none' },
  ask: { status: 'idle' },
  notices: { status: 'answered', value: { moved: [], cancelledAttempts: [] } },
  retry: jest.fn(),
  retryPath: jest.fn(),
  retryNotices: jest.fn(),
  unlock: jest.fn(),
  askAgain: jest.fn(),
  ...fields
})

/** The view's props over given reads, each callback a mock. */
export const viewPropsOf = (fields: Partial<OverviewViewProps> = {}): OverviewViewProps => ({
  reads: readsOf(),
  account: ACCOUNT,
  context: CONTEXT,
  networkName: 'Sepolia',
  timeZone: 'UTC',
  ending: undefined,
  methodNameOf: () => 'Guardian',
  adminOf: () => undefined,
  banner: React.createElement('div', { 'data-testid': 'banner-slot' }),
  step: null,
  held: null,
  onOpen: jest.fn(),
  onTransaction: jest.fn(),
  navigate: jest.fn(),
  ...fields
})

/** The ready state of the client hook over a built client. */
export const readyOver = (
  client: RecoveryKitClient,
  reads: ChainReads | Record<string, never> = {},
  receipts: StepReceipts | Record<string, never> = {}
): ClientState =>
  ({ status: 'ready', client, reads, receipts, retry: () => {} } as unknown as ClientState)

/** Commits a configuration on a fake node at a privacy level, sealed under the card password unless public. */
export const commitAt = (
  chain: World['chain'],
  level: OfferedLevel,
  configuration: Configuration = CONFIGURATION
) =>
  chain.commitSetup(
    configuration,
    privacyOfLevel({ ...configuration, privacy: { publicMetadata: '0x', backup: 'empty' } }, level),
    level === 'public' ? undefined : PASSWORD
  )

/** A setup committed on the account's fake node at a privacy level, and a client and records over it. */
export const worldAt = async (
  level: OfferedLevel,
  account: Address = ACCOUNT,
  storage: RecordStorage = makeStorage()
): Promise<World> => {
  sdkStandIn.reset()
  const chain = sdkStandIn.nodeFor(descriptorOf(WALLET_RECOVERY_CHAIN, ADDRESS_BOOK), account)
  await commitAt(chain, level)
  chain.setAuthorized(true)
  const client = await buildRecoveryClient({
    chain: WALLET_RECOVERY_CHAIN,
    account,
    addressBook: ADDRESS_BOOK,
    provider: sdkStandIn.providerFor(chain)
  })
  return { chain, client, records: createWalletRecords({ storage }) }
}

/** A client over a fake node that starts afresh for the account, as a new page builds it: no setup, nonce zero. */
export const freshClientOf = async (account: Address = ACCOUNT): Promise<RecoveryKitClient> => {
  sdkStandIn.reset()
  const chain = sdkStandIn.nodeFor(descriptorOf(WALLET_RECOVERY_CHAIN, ADDRESS_BOOK), account)
  return buildRecoveryClient({
    chain: WALLET_RECOVERY_CHAIN,
    account,
    addressBook: ADDRESS_BOOK,
    provider: sdkStandIn.providerFor(chain)
  })
}

/** Fake timers that also follow the real clock, so a render's settle still runs while a test moves time. */
export const useAdvancingFakeTimers = (): void =>
  (jest as unknown as AdvancingFakeTimers).useFakeTimers({ advanceTimers: true })

/** The gas check's reads: the key holds far more than any write's gas. */
export const GAS_READS = {
  nativeBalance: async () => 1_000_000_000_000_000_000n,
  estimateGas: async () => 300_000n,
  gasPrice: async () => 2_000_000_000n
} as unknown as ChainReads

/** The receipt waits: each hash lands at once unless a test holds it. */
export const receiptsOver = (): StepReceipts => ({
  blockNumber: jest.fn(async () => armHarness.START_BLOCK),
  transactionKnown: jest.fn(async () => 'known' as const),
  wait: jest.fn(async (hash: Hex) => armHarness.landedReceipt(hash))
})

/** A send port whose batch reaches the chain: it runs `onSend`, then answers the hash. */
export const sendPortOver = (onSend: () => void = () => {}): StepSendPort => ({
  send: jest.fn(async () => {
    throw new Error('the overview never sends from a key alone')
  }),
  sendAccountBatch: jest.fn(async () => {
    onSend()
    return armHarness.TX_HASH
  })
})

/** The account's facts as the wallet reads them, ready with its key. */
export const readyFactsOf = (account: Account, key: KeyHandle) => ({
  status: 'ready' as const,
  facts: armHarness.factsOf(account, { key }),
  retry: () => {}
})

/** What the overview read of the chain before the step opened. */
export const factsOver = async (world: World) => {
  const setup = await world.client.setup.setupState()
  const attempt = await world.client.walletReads.attemptState()
  return { setup, attemptOpen: attemptOpenOf(setup, attempt) }
}

/** A write stored on this device as in flight for one of the overview's writes, with its hash. */
export const storeOverviewWrite = async (
  world: World,
  intent: OverviewIntent,
  account: Address
): Promise<void> => {
  const prepared = await (intent === 'clear'
    ? world.client.setup.prepareClearSetup()
    : world.client.setup.prepareRemoveAuthorization())
  const inFlight = world.records.saveInFlight(CHAIN_ID, account)
  const requestId = requestIdOf(intent)
  await inFlight.claim({
    draft: REMOVAL_DRAFT,
    prepared,
    requestId,
    claimedAt: Date.now(),
    startBlock: armHarness.START_BLOCK
  })
  await inFlight.markSent(requestId, armHarness.TX_HASH, armHarness.START_BLOCK)
}

/** The view over the overview's own reads, for one client state. */
export const ReadsProbe = ({
  client,
  records,
  watcherStorage,
  chainId,
  heldKeys,
  onOpen
}: ReadsProbeProps) => {
  const reads = useOverviewReads({
    client,
    records,
    watcherStorage,
    chainId,
    account: ACCOUNT,
    heldKeys
  })
  return React.createElement(OverviewView, viewPropsOf({ reads, onOpen }))
}
