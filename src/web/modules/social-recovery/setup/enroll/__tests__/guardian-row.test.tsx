/**
 * @jest-environment jsdom
 *
 * The guardian row: the publication line before the field, the advisory
 * checks that never hold Add or Save, the enrollment through the wallet
 * method with no name stored, and the access test signed on this device
 * through the request queue or brought back through the offline block, with
 * the signature checked locally.
 */
import type { Address, Clause, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import type {
  KeyHandle,
  SignOptions,
  TypedDataToSign
} from '@web/modules/social-recovery/shared/client'
import type { RecordStorage, WalletRecords } from '@web/modules/social-recovery/shared/records'

import type { MethodChip } from '@web/modules/social-recovery/shared/display'

import type { EnrollSearch, GuardianChain } from '@web/modules/social-recovery/setup/enroll/types'
import type {
  FakeClient,
  FakeDeps,
  Mounted,
  StorageFaults
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'
import {
  ACCOUNT,
  BOOK,
  CHAIN_ID,
  depsOf,
  DESCRIPTOR,
  each,
  emptySlot,
  guardianConfigOf,
  mountView,
  NOW,
  outside,
  readyClient,
  recordsWith,
  settle,
  storedClauses,
  storedEnrollments,
  t
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const {
  decodeAbiParameters,
  encodeAbiParameters,
  hashTypedData,
  hexToBytes,
  isAddressEqual
}: typeof import('viem') = require('viem')
const { privateKeyToAccount }: typeof import('viem/accounts') = require('viem/accounts')
const {
  REQUEST_WINDOW_SECONDS,
  signerNotWired,
  signFlowFailure
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  renderChip,
  renderFullAddress,
  renderShortAddress
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const {
  guardianChainOf
}: typeof import('@web/modules/social-recovery/setup/enroll/chain') = require('@web/modules/social-recovery/setup/enroll/chain')
const {
  KEY_TEST_DOMAIN_NAME,
  keyTestOf,
  keyTestToSignOf
}: typeof import('@web/modules/social-recovery/setup/enroll/testRequest') = require('@web/modules/social-recovery/setup/enroll/testRequest')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const GUARDIAN = 'socialRecovery.enroll.guardian'
const CEREMONY = 'socialRecovery.ceremony'

const GUARDIAN_KEY = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
)
const OTHER_KEY = privateKeyToAccount(
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
)
const HELD: Address = GUARDIAN_KEY.address
const LOWERCASE = HELD.toLowerCase() as Address
/** The checksummed address with the case of one letter turned. */
const WRONG_CASE = ((): Address => {
  const at = HELD.search(/[a-fA-F]/)
  const letter = HELD[at]
  const turned = letter === letter.toUpperCase() ? letter.toLowerCase() : letter.toUpperCase()
  return `${HELD.slice(0, at)}${turned}${HELD.slice(at + 1)}` as Address
})()

/** A passkey clause, then two empty guardian slots; the screen fills the second. */
const PATH: Clause[] = [
  { threshold: 1, credentials: [emptySlot('passkey')] },
  { threshold: 1, credentials: [emptySlot('ecdsa'), emptySlot('ecdsa')] }
]
const SEARCH: EnrollSearch = { kind: 'ecdsa', at: { clause: 1, member: 1 } }

const chip = (name: MethodChip) => renderChip('method', name, t)

const contractChain = (valid: boolean): GuardianChain => ({
  readCode: async () => '0x6080',
  isValidSignature: async () => valid
})

const signBy = (key: typeof GUARDIAN_KEY, typedData: TypedDataToSign): Promise<Hex> =>
  key.signTypedData(typedData as unknown as Parameters<typeof key.signTypedData>[0])

/** The carried text read back as a signer reads it: each integer member a bigint again. */
const typedDataFromText = (text: string): TypedDataToSign => {
  const carried = JSON.parse(text) as {
    domain: Record<string, unknown>
    types: Record<string, { name: string; type: string }[]>
    primaryType: string
    message: Record<string, unknown>
  }
  const revive = (fields: { name: string; type: string }[], value: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(value).map(([name, member]) => {
        const type = fields.find((field) => field.name === name)?.type ?? ''
        return [name, /^u?int[0-9]*$/.test(type) ? BigInt(member as string) : member]
      })
    )
  return {
    ...carried,
    domain: revive(carried.types.EIP712Domain ?? [], carried.domain),
    message: revive(carried.types[carried.primaryType] ?? [], carried.message)
  } as unknown as TypedDataToSign
}

describe('the guardian row', () => {
  let view: Mounted | undefined
  let records: WalletRecords
  let storage: RecordStorage
  let faults: StorageFaults
  let deps: FakeDeps
  let client: FakeClient

  beforeEach(async () => {
    ;({ records, faults, storage } = await recordsWith(PATH))
    deps = depsOf()
    client = readyClient()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const open = async () => {
    view?.unmount()
    view = await mountView({ records, search: SEARCH, client: client.state, deps })
    return view
  }

  const checkLines = () => view!.allText('guardian-check')

  /** Types a value, then waits past the pause before a name resolves. */
  const enter = async (value: string) => {
    await view!.type('guardian-address', value)
    await settle(450)
  }

  const addGuardian = async (value: string = HELD) => {
    await open()
    await enter(value)
    await view!.press('guardian-add')
  }

  const lastSalt = () => deps.salts[deps.salts.length - 1]

  /** The last challenge the row built, rebuilt from the salt it drew. */
  const lastChallenge = (): TypedDataToSign =>
    keyTestToSignOf(
      keyTestOf({
        chainId: CHAIN_ID,
        account: ACCOUNT,
        key: HELD,
        now: NOW,
        randomBytes: () => hexToBytes(lastSalt())
      })
    )

  describe('before the enrollment', () => {
    it('renders the publication line before the field', async () => {
      await open()
      const publication = view!.byTestId('guardian-publication')
      const field = view!.inputOf('guardian-address')
      expect(publication?.textContent).toBe(t('socialRecovery.disclosures.guardianPublication'))
      if (!publication || !field) {
        throw new Error('the row drew no field')
      }
      // eslint-disable-next-line no-bitwise
      expect(publication.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      )
      expect(view!.text()).toContain(t(`${GUARDIAN}.title`))
      expect(view!.text()).toContain(t(`${GUARDIAN}.lead`))
    })

    it('holds Add while the field names no address', async () => {
      await open()
      expect(view!.isDisabled('guardian-add')).toBe(true)
      expect(view!.byTestId('guardian-checks')).toBeNull()
    })

    it('pastes the clipboard into the field', async () => {
      deps = depsOf({ readClipboard: async () => `  ${HELD}  ` })
      await open()
      await view!.pressText(t('socialRecovery.actions.paste'))
      expect(view!.inputOf('guardian-address')?.value).toBe(HELD)
    })

    it('leaves the field as it was where the clipboard refuses', async () => {
      deps = depsOf({
        readClipboard: async () => {
          throw new Error('denied')
        }
      })
      await open()
      await enter('bluejay')
      await view!.pressText(t('socialRecovery.actions.paste'))
      expect(view!.inputOf('guardian-address')?.value).toBe('bluejay')
    })
  })

  describe('the checks', () => {
    each([
      ['a lowercase address', LOWERCASE],
      ['a checksummed address', HELD]
    ] as const)('passes the checksum of %s', async ([, value]) => {
      await open()
      await enter(value)
      expect(checkLines()).toContain(t(`${GUARDIAN}.checksumOk`))
      expect(view!.byTestId('guardian-checks')?.textContent).toContain(t(`${GUARDIAN}.advisory`))
      expect(view!.isDisabled('guardian-add')).toBe(false)
    })

    it('flags a mixed-case address that fails its checksum, and enrolls it lowercased', async () => {
      await open()
      await enter(WRONG_CASE)
      expect(checkLines()).toContain(t(`${GUARDIAN}.checksumFailed`))
      expect(view!.isDisabled('guardian-add')).toBe(false)
      await view!.press('guardian-add')
      expect(client.enrollParams).toEqual([{ address: LOWERCASE }])
      expect(view!.byTestId('guardian-enrolled')).not.toBeNull()
    })

    it('shows a resolved name with the full address and the caveat', async () => {
      deps = depsOf({ resolveName: async (name) => (name === 'bluejay.eth' ? HELD : '') })
      await open()
      await enter('bluejay.eth')
      expect(checkLines()).toContain(t(`${GUARDIAN}.nameResolves`, { name: 'bluejay.eth' }))
      const resolved = view!.byTestId('guardian-resolved')?.textContent ?? ''
      expect(resolved).toContain(renderFullAddress(HELD))
      expect(resolved).toContain(t('socialRecovery.display.nameCaveat'))
      expect(view!.isDisabled('guardian-add')).toBe(false)
    })

    each([
      ['resolves to nothing', async (): Promise<string> => ''],
      [
        'fails to resolve',
        async (): Promise<string> => {
          throw new Error('node down')
        }
      ]
    ] as const)(
      'reads a name that %s as unresolved, with nothing to add',
      async ([, resolveName]) => {
        deps = depsOf({ resolveName })
        await open()
        await enter('nobody.eth')
        expect(checkLines()).toEqual([t(`${GUARDIAN}.nameUnresolved`)])
        expect(view!.byTestId('guardian-resolved')).toBeNull()
        expect(view!.isDisabled('guardian-add')).toBe(true)
      }
    )

    it('reads no code at an address through the provider', async () => {
      const send = jest.fn(async () => '0x')
      deps = depsOf({ chain: guardianChainOf({ send, call: async () => '0x' }) })
      await open()
      await enter(HELD)
      expect(send).toHaveBeenCalledWith('eth_getCode', [HELD, 'latest'])
      expect(checkLines()).toContain(t(`${GUARDIAN}.noCode`))
      expect(checkLines()).not.toContain(t(`${GUARDIAN}.smartAccountDetected`))
    })

    it('detects a smart account through the provider, and still adds it', async () => {
      deps = depsOf({
        chain: guardianChainOf({ send: async () => '0x6080', call: async () => '0x' })
      })
      await open()
      await enter(HELD)
      expect(checkLines()).toContain(t(`${GUARDIAN}.smartAccountDetected`))
      expect(checkLines()).not.toContain(t(`${GUARDIAN}.noCode`))
      expect(view!.isDisabled('guardian-add')).toBe(false)
    })

    it('renders neither code line where the provider does not answer', async () => {
      deps = depsOf({
        chain: guardianChainOf({
          send: async () => {
            throw new Error('timeout')
          },
          call: async () => '0x'
        })
      })
      await open()
      await enter(HELD)
      expect(checkLines()).not.toContain(t(`${GUARDIAN}.noCode`))
      expect(checkLines()).not.toContain(t(`${GUARDIAN}.smartAccountDetected`))
    })

    it('warns where the wallet derived the address from its own seed, and still adds it', async () => {
      deps = depsOf({ keys: [{ addr: LOWERCASE, type: 'internal', fromSeedId: 'seed-1' }] })
      await open()
      await enter(HELD)
      expect(checkLines()).toContain(t(`${GUARDIAN}.sameSeed`))
      expect(view!.isDisabled('guardian-add')).toBe(false)
    })

    each([
      ['a key the wallet imported alone', [{ addr: HELD, type: 'internal' as const }]],
      ['no key at the address', []]
    ] as const)('reads not the same seed for %s', async ([, keys]) => {
      deps = depsOf({ keys })
      await open()
      await enter(HELD)
      expect(checkLines()).toContain(t(`${GUARDIAN}.notSameSeed`))
    })

    it('holds neither Add nor Save on the worst of every check', async () => {
      deps = depsOf({
        chain: contractChain(false),
        keys: [{ addr: HELD, type: 'internal', fromSeedId: 'seed-1' }]
      })
      await open()
      await enter(WRONG_CASE)
      expect(checkLines()).toEqual([
        t(`${GUARDIAN}.checksumFailed`),
        t(`${GUARDIAN}.smartAccountDetected`),
        t(`${GUARDIAN}.sameSeed`)
      ])
      await view!.press('guardian-add')
      expect(view!.isDisabled('enroll-save')).toBe(false)
      await view!.press('enroll-save')
      expect(view!.navigate).toHaveBeenLastCalledWith(WEB_ROUTES.socialRecoverySetupEditor)
    })
  })

  describe('add', () => {
    it('fills the named slot with the guardian credential and records it not tested', async () => {
      await addGuardian()
      const clauses = await storedClauses(records)
      const credential = clauses[1].credentials[1]
      expect(credential).toEqual({
        method: BOOK.methods.ecdsa,
        config: guardianConfigOf(HELD),
        label: ''
      })
      const [decoded] = decodeAbiParameters([{ type: 'address' }], credential.config)
      expect(isAddressEqual(decoded, HELD)).toBe(true)
      expect(clauses[0]).toEqual(PATH[0])
      expect(clauses[1].credentials[0]).toEqual(emptySlot('ecdsa'))
      expect(await storedEnrollments(records)).toEqual([{ credential, test: 'not-tested' }])
    })

    it('stores no name for a guardian added by a resolved name', async () => {
      deps = depsOf({ resolveName: async () => HELD })
      await addGuardian('bluejay.eth')
      expect(view!.byTestId('guardian-name')?.textContent).toBe('bluejay.eth')
      expect(view!.byTestId('guardian-full-address')?.textContent).toBe(renderFullAddress(HELD))
      expect(view!.byTestId('guardian-enrolled')?.textContent).toContain(
        t('socialRecovery.display.nameCaveat')
      )
      const stored = JSON.stringify(await storage.getAll?.(), (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value
      )
      expect(stored).not.toContain('bluejay')
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment.credential.label).toBe('')
    })

    it('draws the blockie, the short address, the noun, the chip and the lines', async () => {
      await addGuardian()
      expect(view!.byTestId('guardian-blockie')?.getAttribute('data-pfp')).toBe(HELD)
      expect(view!.byTestId('guardian-name')?.textContent).toBe(renderShortAddress(HELD))
      const row = view!.byTestId('guardian-enrolled')?.textContent ?? ''
      expect(row).toContain(t('socialRecovery.display.nouns.guardian'))
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('notTested'))
      expect(view!.byTestId('guardian-smart-account')?.textContent).toBe(
        t('socialRecovery.disclosures.smartAccount')
      )
      expect(view!.byTestId('guardian-call-back')?.textContent).toBe(t(`${GUARDIAN}.callBack`))
      expect(view!.byTestId('guardian-owner-answer')?.textContent).toBe(
        t(`${GUARDIAN}.ownerAnswer`)
      )
      expect(view!.text()).toContain(t(`${GUARDIAN}.howMany`))
      expect(view!.byTestId('guardian-test')?.textContent).toBe(t(`${GUARDIAN}.testThisKey`))
      expect(view!.byTestId('guardian-field')).toBeNull()
      expect(view!.text()).not.toContain(t(`${GUARDIAN}.addAnother`))
    })

    it('reads the guardian back on a reload', async () => {
      await addGuardian()
      await open()
      expect(view!.byTestId('guardian-name')?.textContent).toBe(renderShortAddress(HELD))
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('notTested'))
    })

    it('renders the method note and leaves the field where the build has no guardian method', async () => {
      client.state = {
        status: 'ready',
        client: {
          ...(client.state.status === 'ready' ? client.state.client : ({} as never)),
          methodFor: () => undefined
        }
      }
      await addGuardian()
      expect(view!.byTestId('guardian-add-note')?.textContent).toBe(
        t(`${CEREMONY}.notSupportedNote`)
      )
      expect(view!.inputOf('guardian-address')?.value).toBe(HELD)
      expect(await storedEnrollments(records)).toEqual([])
    })

    it('renders the failed note and leaves the slot empty where the method refuses', async () => {
      if (client.state.status !== 'ready') {
        throw new Error('client not ready')
      }
      client.state.client.approving.enrollInput = () => {
        throw new Error('bad address')
      }
      await addGuardian()
      expect(view!.byTestId('guardian-add-note')?.textContent).toBe(t(`${CEREMONY}.failedNote`))
      expect(view!.inputOf('guardian-address')?.value).toBe(HELD)
      expect(await storedClauses(records)).toEqual(PATH)
    })

    it('renders the write failure and leaves the slot empty where the enrollment cannot be stored', async () => {
      faults.refuse = [':enrollments:']
      await addGuardian()
      expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
        t('socialRecovery.records.writeFailed')
      )
      expect(view!.byTestId('guardian-enrolled')).toBeNull()
      expect(view!.isDisabled('enroll-save')).toBe(true)
      expect(await storedClauses(records)).toEqual(PATH)
    })

    it('refuses a guardian the path already holds, and leaves the slot empty', async () => {
      const held = { method: BOOK.methods.ecdsa, config: guardianConfigOf(HELD), label: '' }
      const path: Clause[] = [PATH[0], { threshold: 1, credentials: [held, emptySlot('ecdsa')] }]
      ;({ records, faults, storage } = await recordsWith(path, [
        { credential: held, test: 'not-tested' }
      ]))
      await addGuardian()
      expect(view!.byTestId('guardian-duplicate')?.textContent).toBe(
        t('socialRecovery.editor.duplicate')
      )
      expect(await storedClauses(records)).toEqual(path)
      expect(view!.isDisabled('enroll-save')).toBe(true)
    })

    it('holds Save until the guardian is added', async () => {
      await open()
      await enter(HELD)
      expect(view!.isDisabled('enroll-save')).toBe(true)
      await view!.press('guardian-add')
      expect(view!.isDisabled('enroll-save')).toBe(false)
    })
  })

  describe('the access test', () => {
    const expectLinesStay = () => {
      expect(view!.byTestId('guardian-smart-account')?.textContent).toBe(
        t('socialRecovery.disclosures.smartAccount')
      )
      expect(view!.byTestId('guardian-call-back')?.textContent).toBe(t(`${GUARDIAN}.callBack`))
      expect(view!.byTestId('guardian-owner-answer')?.textContent).toBe(
        t(`${GUARDIAN}.ownerAnswer`)
      )
    }

    it('builds a key test for the guardian with a fresh salt each time', async () => {
      await addGuardian()
      await view!.press('guardian-test')
      const first = JSON.parse(view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? '{}')
      await view!.press('guardian-test')
      const second = JSON.parse(view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? '{}')
      expect(client.signingInputs).toHaveLength(0)
      expect(first.domain).toEqual({
        name: KEY_TEST_DOMAIN_NAME,
        version: '1',
        chainId: String(CHAIN_ID)
      })
      expect(first.primaryType).toBe('KeyTest')
      expect(first.message).toMatchObject({
        account: ACCOUNT,
        key: HELD,
        validUntil: String(NOW / 1000 + REQUEST_WINDOW_SECONDS)
      })
      expect(first.message.salt).toMatch(/^0x[0-9a-f]{64}$/)
      expect(second.message.salt).not.toBe(first.message.salt)
    })

    it('signs through the request queue with a key the wallet holds, and reads tested', async () => {
      const signTypedData = jest.fn((_key: KeyHandle, typedData: TypedDataToSign) =>
        signBy(GUARDIAN_KEY, typedData)
      )
      deps = depsOf({ keys: [{ addr: HELD, type: 'internal' }], signTypedData })
      await addGuardian()
      await view!.press('guardian-test')

      expect(signTypedData).toHaveBeenCalledWith(
        { addr: HELD, type: 'internal' },
        lastChallenge(),
        { signal: expect.any(AbortSignal) }
      )
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
      expect(view!.byTestId('guardian-test-line')?.textContent).toBe(t(`${GUARDIAN}.testedLine`))
      expect(view!.byTestId('guardian-offline')).toBeNull()
      expectLinesStay()
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment.test).toBe('passed')
      expect(enrollment.cause).toBeUndefined()
    })

    it('carries the challenge out through the offline block where the wallet holds no key', async () => {
      const saveFile = jest.fn()
      deps = depsOf({ saveFile })
      await addGuardian()
      expect(view!.byTestId('guardian-offline')).toBeNull()
      await view!.press('guardian-test')

      const text = view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? ''
      await view!.press('guardian-offline-save')
      expect(saveFile).toHaveBeenCalledWith(
        expect.objectContaining({ text, type: 'application/json' })
      )
      expect(view!.byTestId('guardian-offline')?.textContent).toContain(
        t('socialRecovery.enroll.offline.title')
      )
      // The row reads not tested until the challenge comes back signed.
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('notTested'))
    })

    it('reads tested for a signature the guardian made offline over the carried challenge', async () => {
      await addGuardian()
      await view!.press('guardian-test')
      expect(view!.isDisabled('guardian-offline-check')).toBe(true)
      const carried = view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? ''
      await view!.type(
        'guardian-offline-signature',
        await signBy(GUARDIAN_KEY, typedDataFromText(carried))
      )
      await view!.press('guardian-offline-check')

      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
      expect(view!.byTestId('guardian-test-line')?.textContent).toBe(t(`${GUARDIAN}.testedLine`))
      expect(view!.byTestId('guardian-offline')).toBeNull()
      expectLinesStay()
      expect((await storedEnrollments(records))[0].test).toBe('passed')
    })

    it('reads no match for a signature by another key, and offers a retry', async () => {
      await addGuardian()
      await view!.press('guardian-test')
      await view!.type('guardian-offline-signature', await signBy(OTHER_KEY, lastChallenge()))
      await view!.press('guardian-offline-check')

      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('testFailed'))
      expect(view!.byTestId('guardian-test-line')?.textContent).toBe(
        t(`${CEREMONY}.testFailedNoMatch`)
      )
      expect(view!.byTestId('guardian-test')?.textContent).toBe(t('socialRecovery.writes.tryAgain'))
      expect(view!.byTestId('enroll-save')?.textContent).toBe(
        t('socialRecovery.actions.saveAnyway')
      )
      expect(view!.isDisabled('enroll-save')).toBe(false)
      expectLinesStay()
      const [enrollment] = await storedEnrollments(records)
      expect(enrollment).toMatchObject({ test: 'failed', cause: 'check-rejected' })
    })

    it('holds the check for a paste that is not a signature', async () => {
      await addGuardian()
      await view!.press('guardian-test')
      await view!.type('guardian-offline-signature', 'not a signature')
      expect(view!.isDisabled('guardian-offline-check')).toBe(true)
    })

    it('asks a guardian contract whether it accepts a signature that recovers to another key', async () => {
      const isValidSignature = jest.fn(async () => true)
      deps = depsOf({ chain: { readCode: async () => '0x6080', isValidSignature } })
      await addGuardian()
      await view!.press('guardian-test')
      await view!.type('guardian-offline-signature', await signBy(OTHER_KEY, lastChallenge()))
      await view!.press('guardian-offline-check')
      expect(isValidSignature).toHaveBeenCalledTimes(1)
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
    })

    it('reads a contract answer through the provider with the magic value as accepted', async () => {
      const magic = encodeAbiParameters([{ type: 'bytes4' }], ['0x1626ba7e'])
      const call = jest.fn(async () => magic)
      deps = depsOf({ chain: guardianChainOf({ send: async () => '0x6080', call }) })
      await addGuardian()
      await view!.press('guardian-test')
      await view!.type('guardian-offline-signature', await signBy(OTHER_KEY, lastChallenge()))
      await view!.press('guardian-offline-check')
      expect(call).toHaveBeenCalledWith(expect.objectContaining({ to: HELD }))
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
    })

    it('reads test unavailable where the chain does not answer for a signature by another key', async () => {
      deps = depsOf({
        chain: {
          readCode: async () => {
            throw new Error('timeout')
          },
          isValidSignature: async () => {
            throw new Error('timeout')
          }
        }
      })
      await addGuardian()
      await view!.press('guardian-test')
      await view!.type('guardian-offline-signature', await signBy(OTHER_KEY, lastChallenge()))
      await view!.press('guardian-offline-check')
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('testUnavailable'))
      expect(view!.text().split(t(`${CEREMONY}.testUnavailableLine`))).toHaveLength(2)
      expect(view!.byTestId('guardian-test')?.textContent).toBe(t('socialRecovery.writes.tryAgain'))
      expectLinesStay()
      expect((await storedEnrollments(records))[0]).toMatchObject({
        test: 'unavailable',
        cause: 'service-unanswered'
      })
    })

    it('carries the test to the offline block where the queue cannot sign for the key', async () => {
      const key: KeyHandle = { addr: HELD, type: 'internal' }
      deps = depsOf({
        keys: [key],
        signTypedData: async () => {
          throw signerNotWired('signTypedData', key)
        }
      })
      await addGuardian()
      await view!.press('guardian-test')
      expect(view!.byTestId('guardian-offline')).not.toBeNull()
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('notTested'))

      await view!.type('guardian-offline-signature', await signBy(GUARDIAN_KEY, lastChallenge()))
      await view!.press('guardian-offline-check')
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
    })

    it('leaves the verdict as it was where the holder refuses the signing request', async () => {
      deps = depsOf({
        keys: [{ addr: HELD, type: 'internal' }],
        signTypedData: async () => {
          throw signFlowFailure('signTypedData', 'refused')
        }
      })
      await addGuardian()
      await view!.press('guardian-test')
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('notTested'))
      expect(view!.allText('guardian-test-note')).toEqual([t(`${CEREMONY}.cancelledNote`)])
      expect((await storedEnrollments(records))[0].test).toBe('not-tested')
    })

    it('renders the write failure where the verdict cannot be stored', async () => {
      deps = depsOf({
        keys: [{ addr: HELD, type: 'internal' }],
        signTypedData: (_key, typedData) => signBy(GUARDIAN_KEY, typedData)
      })
      await addGuardian()
      faults.refuse = [':enrollments:']
      await view!.press('guardian-test')
      expect(view!.byTestId('enroll-write-failed')?.textContent).toBe(
        t('socialRecovery.records.writeFailed')
      )
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('notTested'))
    })
  })

  describe('the access test while the client is not ready', () => {
    const reopenEnrolled = async () => {
      const credential = { method: BOOK.methods.ecdsa, config: guardianConfigOf(HELD), label: '' }
      ;({ records } = await recordsWith(
        [PATH[0], { threshold: 1, credentials: [emptySlot('ecdsa'), credential] }],
        [{ credential, test: 'not-tested' }]
      ))
      view?.unmount()
      view = await mountView({ records, search: SEARCH, client: { status: 'loading' }, deps })
    }

    it('signs with a key the wallet holds', async () => {
      const signTypedData = jest.fn((_key: KeyHandle, typedData: TypedDataToSign) =>
        signBy(GUARDIAN_KEY, typedData)
      )
      deps = depsOf({ keys: [{ addr: HELD, type: 'internal' }], signTypedData })
      await reopenEnrolled()
      await view!.press('guardian-test')

      expect(signTypedData).toHaveBeenCalledTimes(1)
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
    })

    it('opens the offline block', async () => {
      deps = depsOf({ keys: [{ addr: HELD, type: 'internal' }] })
      await reopenEnrolled()
      await view!.press('guardian-test-offline')

      expect(view!.byTestId('guardian-offline')).not.toBeNull()
    })
  })

  describe('a signing request the holder withdraws', () => {
    /** A signer that holds every request open until the test answers it. */
    const waitingSigner = () => {
      const signals: AbortSignal[] = []
      const received: TypedDataToSign[] = []
      const answers: ((signature: Hex) => void)[] = []
      const failures: ((error: unknown) => void)[] = []
      const signTypedData = jest.fn(
        (_key: KeyHandle, typedData: TypedDataToSign, options?: SignOptions) =>
          new Promise<Hex>((resolve, reject) => {
            if (options?.signal) {
              signals.push(options.signal)
            }
            received.push(typedData)
            answers.push(resolve)
            failures.push(reject)
          })
      )
      return { signTypedData, signals, received, answers, failures }
    }

    const expectNoOutcome = async () => {
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('notTested'))
      expect(view!.byTestId('guardian-test-line')).toBeNull()
      expect(view!.allText('guardian-test-note')).toEqual([])
      expect((await storedEnrollments(records))[0].test).toBe('not-tested')
    }

    const startHeldTest = async (signer: ReturnType<typeof waitingSigner>) => {
      deps = depsOf({
        keys: [{ addr: HELD, type: 'internal' }],
        signTypedData: signer.signTypedData
      })
      await addGuardian()
      await view!.press('guardian-test')
    }

    it('renders the wait line and the withdraw action while the sign screen is open', async () => {
      const signer = waitingSigner()
      await startHeldTest(signer)
      expect(signer.signTypedData).toHaveBeenCalledTimes(1)
      expect(view!.byTestId('guardian-test-waiting')?.textContent).toContain(
        t(`${GUARDIAN}.waitingForSignScreen`)
      )
      expect(view!.byTestId('guardian-test-withdraw')?.textContent).toBe(
        t(`${GUARDIAN}.testOfflineInstead`)
      )
      expect(view!.byTestId('guardian-offline')).toBeNull()
      expect(signer.signals[0].aborted).toBe(false)
    })

    it('withdraws the request and opens the offline block with the same challenge', async () => {
      const signer = waitingSigner()
      await startHeldTest(signer)
      await view!.press('guardian-test-withdraw')

      expect(signer.signals[0].aborted).toBe(true)
      expect(view!.byTestId('guardian-test-waiting')).toBeNull()
      expect(view!.byTestId('guardian-test-withdraw')).toBeNull()
      expect(view!.byTestId('guardian-offline')).not.toBeNull()
      const carried = view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? ''
      expect(typedDataFromText(carried).message).toEqual(signer.received[0].message)
      expect(signer.signTypedData).toHaveBeenCalledTimes(1)
      await expectNoOutcome()

      await view!.type('guardian-offline-signature', await signBy(GUARDIAN_KEY, signer.received[0]))
      await view!.press('guardian-offline-check')
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
    })

    it('drops a signature that arrives after the request was withdrawn', async () => {
      const signer = waitingSigner()
      await startHeldTest(signer)
      await view!.press('guardian-test-withdraw')
      const signature = await signBy(GUARDIAN_KEY, signer.received[0])
      await outside(async () => signer.answers[0](signature))
      await settle()

      expect(view!.byTestId('guardian-offline')).not.toBeNull()
      expect(view!.byTestId('guardian-test-waiting')).toBeNull()
      await expectNoOutcome()
    })

    it('opens the offline block with no outcome where the signer reports the request withdrawn', async () => {
      const signer = waitingSigner()
      await startHeldTest(signer)
      await outside(async () => signer.failures[0](signFlowFailure('signTypedData', 'withdrawn')))
      await settle()

      expect(view!.byTestId('guardian-offline')).not.toBeNull()
      expect(view!.byTestId('guardian-test-waiting')).toBeNull()
      const carried = view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? ''
      expect(typedDataFromText(carried).message).toEqual(signer.received[0].message)
      await expectNoOutcome()
    })

    it('keeps the outcome and no offline block where the holder refuses', async () => {
      const signer = waitingSigner()
      await startHeldTest(signer)
      await outside(async () => signer.failures[0](signFlowFailure('signTypedData', 'refused')))
      await settle()

      expect(view!.byTestId('guardian-offline')).toBeNull()
      expect(view!.byTestId('guardian-test-waiting')).toBeNull()
      expect(view!.allText('guardian-test-note')).toEqual([t(`${CEREMONY}.cancelledNote`)])
    })

    it('disables both test actions while the request waits and enables them after a withdraw', async () => {
      const signer = waitingSigner()
      await startHeldTest(signer)
      expect(view!.isDisabled('guardian-test')).toBe(true)
      expect(view!.isDisabled('guardian-test-offline')).toBe(true)

      await view!.press('guardian-test-withdraw')
      expect(view!.isDisabled('guardian-test')).toBe(false)
      expect(view!.isDisabled('guardian-test-offline')).toBe(false)
    })

    it('starts a new request after a withdraw and ignores a late answer to the withdrawn one', async () => {
      const signer = waitingSigner()
      await startHeldTest(signer)
      await view!.press('guardian-test-withdraw')
      expect(view!.byTestId('guardian-offline')).not.toBeNull()

      await view!.press('guardian-test')
      expect(signer.signTypedData).toHaveBeenCalledTimes(2)
      expect(signer.signals[1]).not.toBe(signer.signals[0])
      expect(signer.signals[1].aborted).toBe(false)
      expect(view!.byTestId('guardian-offline')).toBeNull()
      expect(view!.byTestId('guardian-test-waiting')).not.toBeNull()

      const late = await signBy(GUARDIAN_KEY, signer.received[0])
      await outside(async () => signer.answers[0](late))
      await settle()
      expect(view!.byTestId('guardian-test-waiting')).not.toBeNull()
      await expectNoOutcome()

      const signature = await signBy(GUARDIAN_KEY, signer.received[1])
      await outside(async () => signer.answers[1](signature))
      await settle()
      expect(view!.byTestId('guardian-test-waiting')).toBeNull()
      expect(view!.byTestId('guardian-offline')).toBeNull()
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
    })

    it('withdraws a request still open when the row goes away', async () => {
      const signer = waitingSigner()
      await startHeldTest(signer)
      expect(signer.signals[0].aborted).toBe(false)
      view!.unmount()
      view = undefined
      expect(signer.signals[0].aborted).toBe(true)
    })
  })

  describe('the offline challenge', () => {
    const carriedText = () => view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? ''

    it('carries the challenge by QR and by file, with no text of it on screen', async () => {
      await addGuardian()
      await view!.press('guardian-test')
      const carried = carriedText()
      expect(JSON.parse(carried).primaryType).toBe('KeyTest')
      expect(view!.byTestId('guardian-offline-save')).not.toBeNull()
      expect(view!.byTestId('guardian-offline-challenge')).toBeNull()
      expect(view!.text()).not.toContain(carried)
      expect(view!.text()).not.toContain(lastSalt())
    })

    it('carries the domain type in the text', async () => {
      await addGuardian()
      await view!.press('guardian-test')
      const carried = JSON.parse(carriedText())
      expect(carried.types.EIP712Domain).toEqual([
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' }
      ])
      expect(carried.primaryType).toBe('KeyTest')
      expect(carried.message.salt).toBe(lastSalt())
    })

    it('drops a signature pasted for an earlier challenge when a new test starts', async () => {
      await addGuardian()
      await view!.press('guardian-test')
      const first = carriedText()
      await view!.type('guardian-offline-signature', await signBy(GUARDIAN_KEY, lastChallenge()))
      expect(view!.isDisabled('guardian-offline-check')).toBe(false)

      await view!.press('guardian-test')
      expect(carriedText()).not.toBe(first)
      expect(view!.inputOf('guardian-offline-signature')?.value).toBe('')
      expect(view!.isDisabled('guardian-offline-check')).toBe(true)
    })

    it('opens the offline block for a key the wallet holds, with no signing request', async () => {
      const signTypedData = jest.fn(async (): Promise<Hex> => '0x')
      deps = depsOf({ keys: [{ addr: HELD, type: 'internal' }], signTypedData })
      await addGuardian()
      expect(view!.byTestId('guardian-test-offline')?.textContent).toBe(
        t('socialRecovery.enroll.offline.title')
      )
      await view!.press('guardian-test-offline')
      expect(view!.byTestId('guardian-offline')).not.toBeNull()
      expect(signTypedData).not.toHaveBeenCalled()
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('notTested'))

      await view!.type('guardian-offline-signature', await signBy(GUARDIAN_KEY, lastChallenge()))
      await view!.press('guardian-offline-check')
      expect(signTypedData).not.toHaveBeenCalled()
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
    })

    it('offers no second offline action where the wallet holds no key at the address', async () => {
      await addGuardian()
      expect(view!.byTestId('guardian-test')).not.toBeNull()
      expect(view!.byTestId('guardian-test-offline')).toBeNull()
    })
  })

  describe('the check of a signature by another key', () => {
    const pasteOtherSignature = async () => {
      await view!.press('guardian-test')
      await view!.type('guardian-offline-signature', await signBy(OTHER_KEY, lastChallenge()))
    }

    it('reads test unavailable where the extension holds no provider', async () => {
      deps = depsOf({ chain: null })
      await addGuardian()
      await pasteOtherSignature()
      await view!.press('guardian-offline-check')
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('testUnavailable'))
      expect(view!.byTestId('guardian-test')?.textContent).toBe(t('socialRecovery.writes.tryAgain'))
      expect((await storedEnrollments(records))[0]).toMatchObject({
        test: 'unavailable',
        cause: 'service-unanswered'
      })
    })

    it('asks the address for its answer without reading its code first', async () => {
      const reads: string[] = []
      const send = jest.fn(async (method: string) => {
        reads.push(method)
        return '0x'
      })
      const call = jest.fn(async (transaction: { to: string }) => {
        reads.push(`call ${transaction.to}`)
        return '0x'
      })
      deps = depsOf({ chain: guardianChainOf({ send, call }) })
      await addGuardian()
      await pasteOtherSignature()
      reads.length = 0
      await view!.press('guardian-offline-check')
      expect(reads).toEqual([`call ${HELD}`])
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('testFailed'))
      expect(view!.byTestId('guardian-test-line')?.textContent).toBe(
        t(`${CEREMONY}.testFailedNoMatch`)
      )
    })
  })

  describe('the key test typed data', () => {
    /** The key test the row built last, as the local check reads it. */
    const lastKeyTest = () =>
      keyTestOf({
        chainId: CHAIN_ID,
        account: ACCOUNT,
        key: HELD,
        now: NOW,
        randomBytes: () => hexToBytes(lastSalt())
      })

    /** The manager's approval typed data for place zero, carrying the key test's salt. */
    const approvalWithSalt = (salt: Hex): TypedDataToSign => ({
      domain: {
        name: 'PolicyManager',
        version: DESCRIPTOR.digestVersion,
        chainId: CHAIN_ID,
        verifyingContract: DESCRIPTOR.manager
      },
      types: {
        Approval: [
          { name: 'account', type: 'address' },
          { name: 'action', type: 'address' },
          { name: 'attemptId', type: 'uint64' },
          { name: 'setupNonce', type: 'uint64' },
          { name: 'validUntil', type: 'uint48' },
          { name: 'place', type: 'uint256' },
          { name: 'salt', type: 'bytes32' }
        ]
      },
      primaryType: 'Approval',
      message: {
        account: ACCOUNT,
        action: DESCRIPTOR.action,
        attemptId: 0n,
        setupNonce: 0n,
        validUntil: BigInt(NOW / 1000 + REQUEST_WINDOW_SECONDS),
        place: 0n,
        salt
      }
    })

    const pasteAndCheck = async (signature: Hex) => {
      await view!.type('guardian-offline-signature', signature)
      await view!.press('guardian-offline-check')
    }

    it('asks the queue to sign under a domain of its own with no verifying contract', async () => {
      const signTypedData = jest.fn((_key: KeyHandle, typedData: TypedDataToSign) =>
        signBy(GUARDIAN_KEY, typedData)
      )
      deps = depsOf({ keys: [{ addr: HELD, type: 'internal' }], signTypedData })
      await addGuardian()
      await view!.press('guardian-test')

      const [[, signed]] = signTypedData.mock.calls
      expect(signed.domain).not.toHaveProperty('verifyingContract')
      expect(signed.domain.name).not.toBe('PolicyManager')
      expect(Object.values(signed.domain)).not.toContain(DESCRIPTOR.manager)
      expect(signed.primaryType).toBe('KeyTest')
      expect(Object.keys(signed.types)).toEqual(['KeyTest'])
      expect(signed.message).toEqual({
        account: ACCOUNT,
        key: HELD,
        salt: lastSalt(),
        validUntil: BigInt(NOW / 1000 + REQUEST_WINDOW_SECONDS)
      })
      expect(client.signingInputs).toHaveLength(0)
    })

    it('reads tested for a signature by the key under test without asking the chain', async () => {
      const isValidSignature = jest.fn(async () => false)
      deps = depsOf({ chain: { readCode: async () => '0x', isValidSignature } })
      await addGuardian()
      await view!.press('guardian-test')
      await pasteAndCheck(await GUARDIAN_KEY.signTypedData(lastKeyTest()))

      expect(isValidSignature).not.toHaveBeenCalled()
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
      expect((await storedEnrollments(records))[0].test).toBe('passed')
    })

    it('reads failed, not unavailable, for a signature by another key the chain refuses', async () => {
      const isValidSignature = jest.fn(async () => false)
      deps = depsOf({ chain: { readCode: async () => '0x', isValidSignature } })
      await addGuardian()
      await view!.press('guardian-test')
      const signature = await OTHER_KEY.signTypedData(lastKeyTest())
      await pasteAndCheck(signature)

      expect(isValidSignature).toHaveBeenCalledWith(HELD, hashTypedData(lastKeyTest()), signature)
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('testFailed'))
      expect(view!.byTestId('guardian-test-line')?.textContent).toBe(
        t(`${CEREMONY}.testFailedNoMatch`)
      )
      expect((await storedEnrollments(records))[0]).toMatchObject({
        test: 'failed',
        cause: 'check-rejected'
      })
    })

    it("reads failed for the key's signature over the manager's approval with the same salt", async () => {
      const isValidSignature = jest.fn(async () => false)
      deps = depsOf({ chain: { readCode: async () => '0x', isValidSignature } })
      await addGuardian()
      await view!.press('guardian-test')
      await pasteAndCheck(await signBy(GUARDIAN_KEY, approvalWithSalt(lastSalt())))

      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('testFailed'))
      expect((await storedEnrollments(records))[0]).toMatchObject({
        test: 'failed',
        cause: 'check-rejected'
      })
    })

    each([
      ['after the window closed', REQUEST_WINDOW_SECONDS + 1, 'testFailed', 'failed'],
      ['within the window', REQUEST_WINDOW_SECONDS, 'tested', 'passed']
    ] as const)(
      "reads the key's own signature pasted %s",
      async ([, secondsLater, chipName, verdict]) => {
        let clock = NOW
        deps = depsOf({ now: () => clock })
        await addGuardian()
        await view!.press('guardian-test')
        const signature = await GUARDIAN_KEY.signTypedData(lastKeyTest())
        clock = NOW + secondsLater * 1000
        await pasteAndCheck(signature)

        expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip(chipName))
        expect((await storedEnrollments(records))[0].test).toBe(verdict)
      }
    )

    it('carries the same typed data by QR and by file as the row asked the queue to sign', async () => {
      const key: KeyHandle = { addr: HELD, type: 'internal' }
      const saveFile = jest.fn()
      const signTypedData = jest.fn<Promise<Hex>, [KeyHandle, TypedDataToSign]>(async () => {
        throw signerNotWired('signTypedData', key)
      })
      deps = depsOf({ keys: [key], signTypedData, saveFile })
      await addGuardian()
      await view!.press('guardian-test')
      await view!.press('guardian-offline-save')

      const [[, signed]] = signTypedData.mock.calls
      const text = view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? ''
      expect(saveFile).toHaveBeenCalledWith(expect.objectContaining({ text }))
      const carried = typedDataFromText(text)
      const { EIP712Domain, ...carriedTypes } = carried.types
      expect(EIP712Domain).toBeDefined()
      expect(carried.domain).toEqual(signed.domain)
      expect(carriedTypes).toEqual(signed.types)
      expect(carried.primaryType).toBe(signed.primaryType)
      expect(carried.message).toEqual(signed.message)
    })

    it('checks a pasted signature over the carried typed data and no other', async () => {
      await addGuardian()
      await view!.press('guardian-test')
      const carried = typedDataFromText(
        view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? ''
      )
      const { EIP712Domain, ...types } = carried.types
      const underManager: TypedDataToSign = {
        ...carried,
        domain: { ...carried.domain, verifyingContract: DESCRIPTOR.manager },
        types
      }
      await pasteAndCheck(await signBy(GUARDIAN_KEY, underManager))
      expect(EIP712Domain).toBeDefined()
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('testFailed'))

      await view!.press('guardian-test')
      const fresh = typedDataFromText(
        view!.byTestId('challenge-qr')?.getAttribute('data-value') ?? ''
      )
      await pasteAndCheck(await signBy(GUARDIAN_KEY, fresh))
      expect(view!.byTestId('guardian-chip')?.textContent).toBe(chip('tested'))
      expect((await storedEnrollments(records))[0].test).toBe('passed')
    })
  })

  describe('the lines of a guardian row', () => {
    it('renders the three lines as soon as the field holds an address, before Add', async () => {
      await open()
      expect(view!.byTestId('guardian-lines')).toBeNull()
      await enter(HELD)
      expect(view!.byTestId('guardian-enrolled')).toBeNull()
      expect(view!.byTestId('guardian-smart-account')?.textContent).toBe(
        t('socialRecovery.disclosures.smartAccount')
      )
      expect(view!.byTestId('guardian-call-back')?.textContent).toBe(t(`${GUARDIAN}.callBack`))
      expect(view!.byTestId('guardian-owner-answer')?.textContent).toBe(
        t(`${GUARDIAN}.ownerAnswer`)
      )
      await view!.press('guardian-add')
      expect(view!.byTestId('guardian-enrolled')).not.toBeNull()
      expect(view!.allText('guardian-smart-account')).toHaveLength(1)
    })

    it('renders the paste hint once', async () => {
      deps = depsOf({ readClipboard: async () => HELD })
      await open()
      expect(view!.text().split(t(`${GUARDIAN}.pasteHint`))).toHaveLength(2)
    })

    it('reads that saving works without the test, under Save, once the guardian is added', async () => {
      await open()
      await enter(HELD)
      expect(view!.byTestId('enroll-save-without-test')).toBeNull()
      await view!.press('guardian-add')
      const note = view!.byTestId('enroll-save-without-test')
      const save = view!.byTestId('enroll-save')
      expect(note?.textContent).toBe(t('socialRecovery.enroll.saveWithoutTest'))
      if (!note || !save) {
        throw new Error('no save line drawn')
      }
      // eslint-disable-next-line no-bitwise
      expect(save.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    })
  })
})
