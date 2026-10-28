/**
 * The fast track's key, sending key and gas check on a fixed public phrase:
 * the key the recovery installs is the library's key at the slot's index,
 * the key of the slot's basic account, and that same key sends the recovery
 * and pays for it.
 */
import {
  BIP44_STANDARD_DERIVATION_TEMPLATE,
  SMART_ACCOUNT_SIGNER_KEY_DERIVATION_OFFSET
} from '@ambire-common/consts/derivation'
import { dedicatedToOneSAPriv } from '@ambire-common/interfaces/keystore'
import { getBasicAccount, getSmartAccount } from '@ambire-common/libs/account/account'
import { KeyIterator } from '@ambire-common/libs/keyIterator/keyIterator'
import {
  accountStepPathOf,
  SLOT_INDEX,
  slotKeyOf,
  submissionCheckOf,
  tempSeedOf
} from '@web/modules/social-recovery/onboarding/fast-track'
import { acknowledgedInState } from '@web/modules/social-recovery/recovery/entry/search'
import type { Account } from '@ambire-common/interfaces/account'
import type { Key } from '@ambire-common/interfaces/keystore'
import type { TempSeed } from '@web/modules/social-recovery/onboarding/fast-track'
import type { Address } from '@kohaku-eth/social-recovery'
import { seedBasicAccountOf } from '@web/modules/social-recovery/shared/client'
import slot from '@web/modules/social-recovery/onboarding/fast-track/__fixtures__/slot.json'
import type { NotHeldCase } from '@web/modules/social-recovery/onboarding/fast-track/__fixtures__/types'

const TEST_PHRASE = slot.phrase
const ORDINARY_KEY = slot.ordinaryKey as Address
const OFFSET_KEY = slot.offsetKey as Address
const SMART_ACCOUNT = slot.smartAccount as Address
const SEED_ID = slot.seedId
const SECOND_KEY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'

const internalKey = (addr: Address, dedicatedToOneSA: boolean): Key => ({
  addr,
  type: 'internal',
  label: addr,
  dedicatedToOneSA,
  meta: { createdAt: 1, fromSeedId: SEED_ID },
  isExternallyStored: false
})

const ordinaryKey = internalKey(ORDINARY_KEY, false)
const offsetKey = internalKey(OFFSET_KEY, true)
const seedlessKey: Key = {
  addr: ORDINARY_KEY,
  type: 'internal',
  label: ORDINARY_KEY,
  dedicatedToOneSA: false,
  meta: { createdAt: 1 },
  isExternallyStored: false
}
const hardwareKey: Key = {
  addr: ORDINARY_KEY,
  type: 'trezor',
  label: ORDINARY_KEY,
  dedicatedToOneSA: false,
  meta: {
    deviceId: 'device',
    deviceModel: 'model',
    hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE,
    index: 0,
    createdAt: 1
  },
  isExternallyStored: true
}
const basicAccount: Account = getBasicAccount(ORDINARY_KEY, [])
let smartAccount: Account

beforeAll(async () => {
  smartAccount = await getSmartAccount([{ addr: OFFSET_KEY, hash: dedicatedToOneSAPriv }], [])
})

const SEED: TempSeed = {
  seed: TEST_PHRASE,
  seedPassphrase: null,
  hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE
}

const libraryKeyAt = async (index: number): Promise<string> => {
  const [key] = await new KeyIterator(TEST_PHRASE, null).retrieve(
    [{ from: index, to: index }],
    BIP44_STANDARD_DERIVATION_TEMPLATE
  )
  return key
}

// The wallets that do not hold the slot's basic account with an ordinary key
// of a recovery phrase.
const notHeld = (): NotHeldCase[] => [
  {
    name: 'the account at that address is a smart account',
    accounts: [{ ...smartAccount, addr: ORDINARY_KEY }],
    keys: [ordinaryKey]
  },
  {
    name: 'the keystore holds the key as a dedicated key',
    accounts: [basicAccount],
    keys: [internalKey(ORDINARY_KEY, true)]
  },
  {
    name: 'the key has no recovery phrase behind it',
    accounts: [basicAccount],
    keys: [seedlessKey]
  },
  {
    name: 'the key at that address is of another kind',
    accounts: [basicAccount],
    keys: [hardwareKey]
  },
  {
    name: 'the keystore does not hold the key',
    accounts: [basicAccount],
    keys: [offsetKey]
  },
  { name: 'the wallet does not list the account', accounts: [smartAccount], keys: [ordinaryKey] }
]

describe('the key that will control the recovered account', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('is the library key at the slot index, the key of its basic account, derived at that index only', async () => {
    const retrieve = jest.spyOn(KeyIterator.prototype, 'retrieve')

    const key = await slotKeyOf(SEED)
    const derivations = retrieve.mock.calls.map(([ranges]) => ranges)

    expect(derivations).toEqual([[{ from: SLOT_INDEX, to: SLOT_INDEX }]])
    expect(key).toBe(await libraryKeyAt(SLOT_INDEX))
    expect(key).toBe(ORDINARY_KEY)
    expect(key).toBe(basicAccount.addr)
  })

  it('is never the key at the slot index plus the smart-account offset', async () => {
    const offset = await libraryKeyAt(SLOT_INDEX + SMART_ACCOUNT_SIGNER_KEY_DERIVATION_OFFSET)

    expect(offset).toBe(OFFSET_KEY)
    expect(await slotKeyOf(SEED)).not.toBe(offset)
  })

  it('follows the index it is given', async () => {
    expect(await slotKeyOf(SEED, 1)).toBe(SECOND_KEY)
  })
})

describe('the phrase the keystore sends to the page', () => {
  it('reads a temporary seed with a known path template and nothing else', () => {
    expect(
      tempSeedOf({
        tempSeed: { seed: TEST_PHRASE, hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE }
      })
    ).toEqual(SEED)
    expect(
      tempSeedOf({ tempSeed: { seed: TEST_PHRASE, hdPathTemplate: 'm/0/<account>' } })
    ).toBeNull()
    expect(
      tempSeedOf({ tempSeed: { seed: '', hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE } })
    ).toBeNull()
    expect(tempSeedOf({ privateKey: '0x01' })).toBeNull()
    expect(tempSeedOf(null)).toBeNull()
  })
})

describe('the basic account at the slot, which receives control and sends the recovery', () => {
  it('is the listed basic account at the key once the keystore holds it as an ordinary key', () => {
    expect(seedBasicAccountOf(ORDINARY_KEY, [basicAccount], [ordinaryKey])).toBe(ORDINARY_KEY)
    expect(
      seedBasicAccountOf(ORDINARY_KEY, [smartAccount, basicAccount], [offsetKey, ordinaryKey])
    ).toBe(ORDINARY_KEY)
  })

  it('is the key the recovery installs', async () => {
    expect(seedBasicAccountOf(ORDINARY_KEY, [basicAccount], [ordinaryKey])).toBe(
      await slotKeyOf(SEED)
    )
  })

  it('is the receiving account itself where the phrase gives more than one listed basic account', () => {
    const keys: Key[] = [ordinaryKey, internalKey(SECOND_KEY, false)]
    const accounts = [basicAccount, getBasicAccount(SECOND_KEY, [])]

    expect(seedBasicAccountOf(ORDINARY_KEY, accounts, keys)).toBe(ORDINARY_KEY)
    expect(seedBasicAccountOf(SECOND_KEY, accounts, keys)).toBe(SECOND_KEY)
  })

  it('is never a listed smart account, even with its dedicated key held', () => {
    expect(seedBasicAccountOf(SMART_ACCOUNT, [smartAccount], [offsetKey])).toBeNull()
    expect(seedBasicAccountOf(OFFSET_KEY, [smartAccount], [offsetKey])).toBeNull()
    expect(
      seedBasicAccountOf(SMART_ACCOUNT, [basicAccount, smartAccount], [ordinaryKey, offsetKey])
    ).toBeNull()
  })

  it('is none where the wallet does not hold the basic account with an ordinary key', () => {
    notHeld().forEach(({ name, accounts, keys }) => {
      expect([name, seedBasicAccountOf(ORDINARY_KEY, accounts, keys)]).toEqual([name, null])
    })
  })
})

describe("the fast track's gas check for the submission", () => {
  const network = { name: 'Sepolia', nativeAssetSymbol: 'ETH' }

  it('reads the sending key and answers enough where its balance covers the estimate', async () => {
    const nativeBalance = jest.fn(async () => 1_000_000_000_000_000_000n)

    const check = await submissionCheckOf({
      reads: { gasPrice: async () => 1_000_000_000n, nativeBalance },
      key: ORDINARY_KEY,
      network,
      gas: 100_000n
    })

    expect(check.kind).toBe('enough')
    expect(nativeBalance).toHaveBeenCalledWith(ORDINARY_KEY)
  })

  it('offers only the deposit from outside into the sending key where it holds too little', async () => {
    const check = await submissionCheckOf({
      reads: { gasPrice: async () => 1_000_000_000n, nativeBalance: async () => 0n },
      key: ORDINARY_KEY,
      network,
      gas: 100_000n
    })

    if (check.kind !== 'deposit') {
      throw new Error(`expected a deposit step, got ${check.kind}`)
    }
    expect(check.step.fastTrack).toBe(true)
    expect(check.step.key).toBe(ORDINARY_KEY)
    expect(check.step.operates).toBeUndefined()
    expect(check.step.routes.map((route) => route.kind)).toEqual(['outside'])
    expect(check.step.routes[0]).toMatchObject({ to: ORDINARY_KEY })
    expect(check.step.shortfall).toBe(check.step.estimate.asked)
  })

  it('rejects where a read fails, so the step never shows a stale answer', async () => {
    await expect(
      submissionCheckOf({
        reads: {
          gasPrice: async () => 1n,
          nativeBalance: async () => {
            throw new Error('node down')
          }
        },
        key: ORDINARY_KEY,
        network
      })
    ).rejects.toThrow('node down')
  })
})

describe("the fast track's hand-over", () => {
  it('opens the account step on the fresh install route with the account that receives control', () => {
    const [path, search] = accountStepPathOf(ORDINARY_KEY).split('?')
    const params = new URLSearchParams(search)

    expect(path).toBe('social-recovery/recovery/account')
    expect(params.get('route')).toBe('fresh-install')
    expect(params.get('to')).toBe(ORDINARY_KEY)
  })

  it('counts the warning as acknowledged only on the exact flag the warning hands over', () => {
    expect(acknowledgedInState({ acknowledged: true, prevRoute: { pathname: '/' } })).toBe(true)
    expect(acknowledgedInState({ acknowledged: 'true' })).toBe(false)
    expect(acknowledgedInState({ prevRoute: { pathname: '/' } })).toBe(false)
    expect(acknowledgedInState(null)).toBe(false)
    expect(acknowledgedInState(undefined)).toBe(false)
  })
})
