/**
 * @jest-environment jsdom
 *
 * The approval page's signing half: how the wallet holds the key the request
 * names and what the sign action does with each reading, the signature made
 * in the wallet's own sign window and the approval line it turns into, each
 * way a signing brings no approval, the offline block's payload and its
 * pasted signature, the copy actions, the reads stopping once an approval
 * exists, and the decline's message.
 */
import type { Hex } from '@kohaku-eth/social-recovery'
import type { SignOptions, TypedDataToSign } from '@web/modules/social-recovery/shared/client'

import {
  ACCOUNT,
  advance,
  approvalOf,
  GUARDIAN,
  GUARDIAN_ACCOUNT,
  CREATED_AT,
  hashOf,
  kit,
  lineOf,
  linkOf,
  malformedSignature,
  mountLive,
  navigate,
  NEW_KEY,
  notListedRefusal,
  pastedReplyOf,
  readyClient,
  attemptStateOf,
  replyOf,
  requestOf,
  resetEdges,
  searchOf,
  selectAccount,
  selections,
  setClient,
  settle,
  signatureBy,
  signRefusal,
  STRANGER_ACCOUNT,
  SUBMITTED,
  t,
  typedDataFor,
  UNLOCK_ROUTE,
  unmountPages,
  VALID_UNTIL,
  wallet
} from '@web/modules/social-recovery/guardian-page/__tests__/harness'
import type {
  Mounted,
  TypedField
} from '@web/modules/social-recovery/guardian-page/__tests__/harness'
import { SELECT_ACCOUNT_LIMIT_MS } from '@web/modules/social-recovery/guardian-page/constants'

const PAGE = 'socialRecovery.guardianPage'
const SIGNING = `${PAGE}.signing`
const OFFLINE = `${PAGE}.offline`
const MINUTE = 60_000
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const dateOf = (ms: number) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
    timeZoneName: 'short'
  }).format(new Date(ms))
/** The deadline line of a request open for another 24 hours. */
const deadlineLine = () =>
  t(`${PAGE}.details.validUntil`, {
    date: dateOf(VALID_UNTIL * 1000),
    remaining: t('socialRecovery.display.remainingHours', { count: 24 })
  })

beforeEach(resetEdges)
afterEach(() => {
  unmountPages()
  jest.useRealTimers()
})

/** The page with the acknowledgment ticked. */
const mountTicked = async (): Promise<Mounted> => {
  const page = await mountLive()
  await page.press('guardian-acknowledge')
  return page
}

/** Lets a signing that waits on real crypto finish, then renders it. */
const finish = async () => {
  for (let round = 0; round < 5; round += 1) {
    // eslint-disable-next-line no-await-in-loop
    await settle()
  }
}

/** A sign window that stays open until the test answers it, and the signal of each request. */
const heldSignWindow = () => {
  const answers: ((signature: Hex) => void)[] = []
  const signals: (AbortSignal | undefined)[] = []
  wallet.signTypedData.mockImplementation(
    (_key, _typedData, options?: SignOptions) =>
      new Promise((resolve) => {
        answers.push(resolve)
        signals.push(options?.signal)
      })
  )
  return { answers, signals }
}

/** The typed data an offline device reads back from the carried payload. */
const typedDataFromPayload = (text: string): TypedDataToSign => {
  const carried = JSON.parse(text) as {
    domain: Record<string, unknown>
    types: Record<string, { name: string; type: string }[]>
    primaryType: string
    message: Record<string, unknown>
  }
  const revive = (fields: TypedField[], value: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(value).map(([name, member]) => {
        const type = fields.find((field) => field.name === name)?.type ?? ''
        if (/^u?int[0-9]*$/.test(type)) {
          return [name, BigInt(member as string)]
        }
        const nested = carried.types[type]
        return [name, nested ? revive(nested, member as Record<string, unknown>) : member]
      })
    )
  return {
    ...carried,
    domain: revive(carried.types.EIP712Domain ?? [], carried.domain),
    message: revive(carried.types[carried.primaryType] ?? [], carried.message)
  } as unknown as TypedDataToSign
}

describe('the key the request names', () => {
  it('reads as held, in full, and lets the ticked page sign', async () => {
    const page = await mountLive()
    expect(page.textOf('guardian-key-address')).toBe(GUARDIAN)
    expect(page.textOf('guardian-key-held')).toBe(t(`${SIGNING}.keyHeld`))
    expect(page.isDisabled('guardian-sign')).toBe(true)
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    page.unmount()
  })

  it('reads as missing where the keystore does not hold it, and keeps sign disabled', async () => {
    wallet.keystore.keys = [{ addr: STRANGER_ACCOUNT.address, type: 'internal' }]
    const page = await mountTicked()
    expect(page.textOf('guardian-key-missing')).toBe(
      t(`${SIGNING}.keyMissing`, { address: GUARDIAN })
    )
    expect(page.has('guardian-key-held')).toBe(false)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })

  it('reads as missing with the import repair where the wallet has no keystore', async () => {
    wallet.keystore = { keys: [], isUnlocked: false, hasPasswordSecret: false }
    const page = await mountTicked()
    expect(page.textOf('guardian-key-missing')).toBe(
      t(`${SIGNING}.keyMissing`, { address: GUARDIAN })
    )
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })

  it('reads as locked, and the sign action goes to the unlock with this page as its return', async () => {
    wallet.keystore.isUnlocked = false
    const page = await mountLive()
    expect(page.textOf('guardian-key-locked')).toBe(t(`${SIGNING}.unlock`))
    expect(page.textOf('guardian-key-address')).toBe(GUARDIAN)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    await page.press('guardian-sign')
    expect(wallet.navigate).toHaveBeenCalledWith(UNLOCK_ROUTE, {
      state: {
        returnTo: {
          pathname: '/social-recovery/approve',
          search: searchOf(linkOf(requestOf())),
          hash: ''
        }
      }
    })
    expect(wallet.signTypedData).not.toHaveBeenCalled()
    page.unmount()
  })

  it('reads as not readable where the request names another method, and keeps sign disabled', async () => {
    const page = await mountLive(requestOf({ method: STRANGER_ACCOUNT.address }))
    await page.press('guardian-acknowledge')
    expect(page.textOf('guardian-key-unreadable')).toBe(t(`${PAGE}.notReadable`))
    expect(page.isDisabled('guardian-sign')).toBe(true)
    page.unmount()
  })
})

describe('the signing step', () => {
  it('renders the four values, the deadline and the submittable sentence', async () => {
    const page = await mountLive()
    expect(page.textOf('guardian-signing-title')).toBe(t(`${SIGNING}.title`))
    expect(page.textOf('guardian-signing-values-value-accountBeingRecovered')).toBe(ACCOUNT)
    expect(page.textOf('guardian-signing-values-value-newKey')).toBe(NEW_KEY)
    expect(page.textOf('guardian-signing-values-deadline')).toBe(deadlineLine())
    expect(page.textOf('guardian-signing-values-submittable')).toBe(
      t('socialRecovery.checklist.submittable')
    )
    expect(page.textOf('guardian-sign-block')).not.toContain(t(`${SIGNING}.promptNote`))
    expect(page.textOf('guardian-sign-block')).not.toContain(t(`${SIGNING}.hardwareNote`))
    page.unmount()
  })

  it('signs the typed data with the held key and shows the approval line the reply makes', async () => {
    const request = requestOf()
    const typedData = typedDataFor(request)
    const signature = await signatureBy(GUARDIAN_ACCOUNT, typedData)
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1)
    expect(wallet.signTypedData).toHaveBeenCalledWith(
      { addr: GUARDIAN, type: 'internal' },
      typedData,
      { signal: expect.any(AbortSignal) }
    )
    expect(kit.replyFrom).toHaveBeenCalledWith(request, typedData, { signature })
    expect(kit.verify).toHaveBeenCalledWith(request, request.place, signature)
    expect(page.textOf('guardian-brand')).toBe(t(`${PAGE}.brand`))
    expect(page.textOf('guardian-signed-title')).toBe(t(`${PAGE}.signed.title`))
    expect(page.textOf('guardian-signed-line')).toBe(approvalOf(signature))
    expect(page.textOf('guardian-stage-counter')).toBe(
      t(`${PAGE}.stageCounter`, { step: 3, total: 3 })
    )
    const aside = page.textOf('guardian-signed-columns-aside')
    expect(aside).toContain(t(`${PAGE}.signed.regretTitle`))
    expect(page.textOf('guardian-signed-regret')).toBe(t(`${PAGE}.signed.regret`))
    expect(aside).toContain(t(`${PAGE}.signed.regret`))
    expect(page.textOf('guardian-signed-columns-main')).not.toContain(t(`${PAGE}.signed.regret`))
    expect(page.has('guardian-lead')).toBe(false)

    const line = lineOf(replyOf(request, signature))
    await page.press('guardian-signed-copy')
    expect(wallet.copied).toHaveBeenLastCalledWith(line)
    expect(line.startsWith('{"kind":"recovery-proof-reply","version":1,"chainId":"')).toBe(true)
    expect(line).not.toContain('\n')
    expect(pastedReplyOf(line)).toEqual(replyOf(request, signature))
    expect(page.textOf('guardian-signed-copy-approval-copied')).toBe(
      t('socialRecovery.checklist.guardian.copied')
    )
    await page.press('guardian-signed-copy-message')
    expect(wallet.copied).toHaveBeenLastCalledWith(
      t(`${PAGE}.signed.message`, { account: ACCOUNT, line })
    )
    page.unmount()
  })

  it('says so where the clipboard refuses the approval line', async () => {
    wallet.copied.mockImplementation(async () => false)
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    await page.press('guardian-signed-copy')
    expect(page.textOf('guardian-signed-copy-approval-failed')).toBe(
      t('socialRecovery.checklist.guardian.copyFailed')
    )
    expect(page.has('guardian-signed-copy-approval-copied')).toBe(false)
    page.unmount()
  })

  it('passes a signature by another key, which the approving side cannot judge', async () => {
    wallet.signTypedData.mockImplementation((_key, typedData) =>
      signatureBy(STRANGER_ACCOUNT, typedData)
    )
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('keeps nothing for bytes the approving side rejects and reads that the key is wrong', async () => {
    wallet.signTypedData.mockImplementation(async (_key, typedData) =>
      malformedSignature(await signatureBy(GUARDIAN_ACCOUNT, typedData))
    )
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.text()).toContain(t(`${SIGNING}.wrongKey`))
    expect(page.has('guardian-sign-retry')).toBe(true)
    page.unmount()
  })

  it('reads a signature the sign window returned for another key as the wrong key', async () => {
    wallet.signTypedData.mockRejectedValue(signRefusal('signer-mismatch'))
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(page.text()).toContain(t(`${SIGNING}.wrongKey`))
    expect(kit.replyFrom).not.toHaveBeenCalled()
    page.unmount()
  })

  it('reads a refusal in the sign window as refused, and Try again signs again', async () => {
    wallet.signTypedData.mockRejectedValueOnce(signRefusal('refused'))
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(page.text()).toContain(t(`${SIGNING}.refused`))
    expect(page.has('guardian-signed')).toBe(false)
    await page.press('guardian-sign-retry')
    await finish()
    expect(wallet.signTypedData).toHaveBeenCalledTimes(2)
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('reads any other throw, and a reply the approving side cannot package, as failed', async () => {
    wallet.signTypedData.mockRejectedValueOnce(new Error('the background went away'))
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(page.text()).toContain(t(`${SIGNING}.failed`))

    kit.replyFrom.mockImplementation(async () => ({
      kind: 'reply-failure',
      cause: 'material-rejected'
    }))
    await page.press('guardian-sign-retry')
    await finish()
    expect(page.text()).toContain(t(`${SIGNING}.failed`))
    expect(page.has('guardian-signed')).toBe(false)
    page.unmount()
  })

  it('is busy while the sign window is open, and a second press asks for nothing more', async () => {
    let answer: (signature: `0x${string}`) => void = () => {}
    wallet.signTypedData.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    const page = await mountTicked()
    await page.press('guardian-sign')
    expect(page.textOf('guardian-sign-busy')).toBe(
      t('socialRecovery.enroll.guardian.waitingForSignScreen')
    )
    expect(page.hasWithin('guardian-sign-busy', 'loading-row')).toBe(true)
    expect(page.isDisabled('guardian-sign')).toBe(true)
    await page.press('guardian-sign')
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1)
    answer(await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf())))
    await finish()
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('drops an approval confirmed after the deadline passed, and shows the request expired', async () => {
    const request = requestOf({ validUntil: String(CREATED_AT + 90) })
    const { answers } = heldSignWindow()
    const page = await mountLive(request)
    await page.press('guardian-acknowledge')
    await page.press('guardian-sign')
    expect(page.has('guardian-sign-busy')).toBe(true)
    await advance(MINUTE)
    await advance(31_000)
    answers[0](await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(request)))
    await finish()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.has('guardian-dead-expired')).toBe(true)
    page.unmount()
  })

  it('drops an approval confirmed after a read found the setup changed', async () => {
    const { answers } = heldSignWindow()
    const page = await mountTicked()
    await page.press('guardian-sign')
    kit.attemptState.mockImplementation(async () => attemptStateOf({ setupNonce: 3n }))
    await advance(MINUTE)
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    answers[0](await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf())))
    await finish()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    page.unmount()
  })

  it('keeps the recovery waiting through a later failed read, and drops the approval that arrives then', async () => {
    const { answers } = heldSignWindow()
    const page = await mountTicked()
    await page.press('guardian-sign')
    kit.attemptState.mockImplementation(async () =>
      attemptStateOf({ attempt: SUBMITTED, nextAttemptId: 4n })
    )
    await advance(MINUTE)
    expect(page.has('guardian-waiting')).toBe(true)
    kit.attemptState.mockImplementation(async () => {
      throw new Error('rpc down')
    })
    await advance(MINUTE)
    expect(page.has('guardian-read-failed')).toBe(true)
    answers[0](await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf())))
    await finish()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.has('guardian-read-failed')).toBe(true)
    page.unmount()
  })

  it('keeps a changed setup through a read that would fail, and drops the approval that arrives then', async () => {
    const { answers } = heldSignWindow()
    const page = await mountTicked()
    await page.press('guardian-sign')
    kit.attemptState.mockImplementation(async () => attemptStateOf({ setupNonce: 3n }))
    await advance(MINUTE)
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    kit.attemptState.mockImplementation(async () => {
      throw new Error('rpc down')
    })
    await advance(MINUTE)
    answers[0](await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf())))
    await finish()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    page.unmount()
  })

  it('withdraws the sign request once a read finds the request ended, with the window open', async () => {
    const { signals } = heldSignWindow()
    const page = await mountTicked()
    await page.press('guardian-sign')
    expect(signals[0]?.aborted).toBe(false)
    kit.attemptState.mockImplementation(async () => attemptStateOf({ nextAttemptId: 4n }))
    await advance(MINUTE)
    expect(signals[0]?.aborted).toBe(true)
    page.unmount()
  })

  it('reads the chain no more once a read found the request dead', async () => {
    kit.attemptState.mockImplementation(async () => attemptStateOf({ setupNonce: 3n }))
    const page = await mountLive()
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    await advance(3 * MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    page.unmount()
  })

  it('keeps a found death through a client built again, directly or through loading, and reads no more', async () => {
    kit.attemptState.mockImplementation(async () => attemptStateOf({ setupNonce: 3n }))
    const page = await mountLive()
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    kit.attemptState.mockImplementation(async () => {
      throw new Error('rpc down')
    })
    setClient(readyClient())
    await settle()
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    expect(page.has('guardian-read-failed')).toBe(false)
    setClient({ status: 'loading', retry: () => {} })
    setClient(readyClient())
    await settle()
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    expect(page.has('guardian-read-failed')).toBe(false)
    await advance(3 * MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    expect(page.has('guardian-dead-setup-changed')).toBe(true)
    page.unmount()
  })

  it('reads, signs and keeps reading a later request opened where an earlier one read void', async () => {
    const othersAttempt = { ...SUBMITTED, payloadHash: `0x${'ee'.repeat(32)}` as Hex }
    kit.attemptState.mockImplementation(async () =>
      attemptStateOf({ attempt: othersAttempt, nextAttemptId: 4n })
    )
    const page = await mountLive()
    expect(page.has('guardian-dead-void')).toBe(true)

    kit.attemptState.mockImplementation(async () => attemptStateOf({ nextAttemptId: 4n }))
    const later = requestOf({ attemptId: '4' })
    await navigate(searchOf(linkOf(later)))
    expect(page.has('guardian-dead-void')).toBe(false)
    expect(page.has('guardian-lead')).toBe(true)
    expect(kit.attemptState).toHaveBeenCalledTimes(2)
    await advance(MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(3)
    expect(page.has('guardian-lead')).toBe(true)

    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    await page.press('guardian-sign')
    await finish()
    const signature = await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(later))
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1)
    expect(page.textOf('guardian-signed-line')).toBe(approvalOf(signature))
    page.unmount()
  })

  it('withdraws the sign request on a decline, and drops the signature that arrives after it', async () => {
    const { answers, signals } = heldSignWindow()
    const page = await mountTicked()
    await page.press('guardian-sign')
    expect(page.isDisabled('guardian-decline')).toBe(false)
    await page.press('guardian-decline')
    expect(signals[0]?.aborted).toBe(true)
    expect(page.has('guardian-declined')).toBe(true)
    answers[0](await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf())))
    await finish()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.has('guardian-declined')).toBe(true)
    page.unmount()
  })

  it('withdraws the sign request when the page goes away', async () => {
    const { signals } = heldSignWindow()
    const page = await mountTicked()
    await page.press('guardian-sign')
    expect(signals[0]?.aborted).toBe(false)
    page.unmount()
    expect(signals[0]?.aborted).toBe(true)
  })

  it('stops reading the chain once the approval exists', async () => {
    const page = await mountTicked()
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    await page.press('guardian-sign')
    await finish()
    expect(page.has('guardian-signed')).toBe(true)
    await advance(3 * MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('reads the chain no more through a client built again after the approval', async () => {
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(page.has('guardian-signed')).toBe(true)
    setClient({ status: 'loading', retry: () => {} })
    setClient(readyClient())
    await settle()
    setClient(readyClient())
    await settle()
    await advance(3 * MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('reads the chain no more through a client built again after a decline', async () => {
    const page = await mountLive()
    await page.press('guardian-decline')
    setClient({ status: 'loading', retry: () => {} })
    setClient(readyClient())
    await settle()
    setClient(readyClient())
    await settle()
    await advance(3 * MINUTE)
    expect(kit.attemptState).toHaveBeenCalledTimes(1)
    page.unmount()
  })
})

describe('the account the wallet signs for', () => {
  const SELECT_GUARDIAN = {
    type: 'MAIN_CONTROLLER_SELECT_ACCOUNT',
    params: { accountAddr: GUARDIAN }
  }

  it("selects nothing where the key's account is already selected, and signs once", async () => {
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(selections()).toEqual([])
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1)
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it("selects the key's account where another is selected, and signs once the wallet reports it", async () => {
    selectAccount(STRANGER_ACCOUNT.address)
    const page = await mountTicked()
    await page.press('guardian-sign')
    expect(selections()).toEqual([SELECT_GUARDIAN])
    expect(wallet.signTypedData).not.toHaveBeenCalled()
    expect(page.has('guardian-sign-busy')).toBe(true)
    await page.press('guardian-sign')
    expect(selections()).toHaveLength(1)

    selectAccount(GUARDIAN)
    await finish()
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1)
    expect(wallet.signTypedData.mock.calls[0][0].addr).toBe(GUARDIAN)
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('reads a selection that never lands as failed, queues no sign request, and Try again selects again', async () => {
    selectAccount(STRANGER_ACCOUNT.address)
    const page = await mountTicked()
    await page.press('guardian-sign')
    await advance(SELECT_ACCOUNT_LIMIT_MS - 1)
    expect(page.has('guardian-sign-busy')).toBe(true)
    await advance(1)
    await finish()
    expect(page.text()).toContain(t(`${SIGNING}.failed`))
    expect(page.has('guardian-sign-retry')).toBe(true)
    expect(page.has('guardian-sign-busy')).toBe(false)
    expect(wallet.signTypedData).not.toHaveBeenCalled()

    await page.press('guardian-sign-retry')
    expect(selections()).toEqual([SELECT_GUARDIAN, SELECT_GUARDIAN])
    selectAccount(GUARDIAN)
    await finish()
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1)
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('queues no sign request for a decline during the selection, even once the selection lands', async () => {
    selectAccount(STRANGER_ACCOUNT.address)
    const page = await mountTicked()
    await page.press('guardian-sign')
    await page.press('guardian-decline')
    expect(page.has('guardian-declined')).toBe(true)
    selectAccount(GUARDIAN)
    await advance(SELECT_ACCOUNT_LIMIT_MS)
    await finish()
    expect(wallet.signTypedData).not.toHaveBeenCalled()
    expect(page.has('guardian-declined')).toBe(true)
    page.unmount()
  })

  it('queues no sign request once the page goes away during the selection', async () => {
    selectAccount(STRANGER_ACCOUNT.address)
    const page = await mountTicked()
    await page.press('guardian-sign')
    page.unmount()
    selectAccount(GUARDIAN)
    await finish()
    expect(wallet.signTypedData).not.toHaveBeenCalled()
  })

  it('queues no sign request for another link opened during the selection, even once the selection lands', async () => {
    selectAccount(STRANGER_ACCOUNT.address)
    const page = await mountTicked()
    await page.press('guardian-sign')
    expect(page.has('guardian-sign-busy')).toBe(true)
    await navigate(searchOf(linkOf(requestOf({ salt: '0x03' }))))
    expect(page.has('guardian-sign-busy')).toBe(false)
    selectAccount(GUARDIAN)
    await advance(SELECT_ACCOUNT_LIMIT_MS + 1_000)
    await finish()
    expect(wallet.signTypedData).not.toHaveBeenCalled()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.text()).not.toContain(t(`${SIGNING}.failed`))
    page.unmount()
  })

  it('selects nothing for a held key the wallet does not list as a basic account, and reads the refusal as failed', async () => {
    wallet.accounts = [
      { addr: STRANGER_ACCOUNT.address, associatedKeys: [STRANGER_ACCOUNT.address], creation: null }
    ]
    selectAccount(STRANGER_ACCOUNT.address)
    wallet.signTypedData.mockImplementation((key) => Promise.reject(notListedRefusal(key)))
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(selections()).toEqual([])
    expect(wallet.signTypedData).toHaveBeenCalledTimes(1)
    expect(page.text()).toContain(t(`${SIGNING}.failed`))
    expect(page.has('guardian-sign-retry')).toBe(true)
    expect(page.has('guardian-signed')).toBe(false)
    page.unmount()
  })
})

describe('the offline block', () => {
  const openOffline = async (): Promise<Mounted> => {
    const page = await mountLive()
    await page.press('guardian-offline-open')
    return page
  }

  it('carries the typed data out by QR, copy and file, with the values, deadline and numbers', async () => {
    const request = requestOf()
    const page = await openOffline()
    expect(page.textOf('guardian-offline-title')).toBe(t(`${OFFLINE}.title`))
    expect(page.textOf('guardian-offline-values-value-newKey')).toBe(NEW_KEY)
    expect(page.textOf('guardian-offline-values-deadline')).toBe(deadlineLine())
    expect(page.textOf('guardian-offline-values-submittable')).toBe(
      t('socialRecovery.checklist.submittable')
    )
    expect(page.textOf('guardian-offline-setup-number')).toBe(request.setupNonce)
    expect(page.textOf('guardian-offline-attempt-number')).toBe(request.attemptId)
    expect(page.textOf('guardian-offline-check-device')).toBe(t(`${OFFLINE}.checkDevice`))
    expect(page.textOf('guardian-offline-return')).toContain(t(`${OFFLINE}.pasteLabel`))
    expect(page.has('guardian-page-columns-aside')).toBe(false)

    const payload = wallet.qr[wallet.qr.length - 1]
    expect(hashOf(typedDataFromPayload(payload))).toBe(hashOf(typedDataFor(request)))
    await page.press('guardian-offline-copy-payload')
    expect(wallet.copied).toHaveBeenLastCalledWith(payload)
    await page.press('guardian-offline-save')
    expect(wallet.saved).toHaveBeenCalledWith({
      name: expect.stringMatching(/\.json$/),
      text: payload,
      type: 'application/json'
    })
    page.unmount()
  })

  it('keeps the add action under the acknowledgment', async () => {
    const page = await openOffline()
    await page.type('guardian-offline-signature', '0x1234')
    expect(page.isDisabled('guardian-offline-add')).toBe(true)
    expect(page.has('guardian-offline-tick-first')).toBe(true)
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-offline-add')).toBe(false)
    page.unmount()
  })

  it('turns a signature by the named key, made from the carried payload, into the same line', async () => {
    const request = requestOf()
    const page = await openOffline()
    const carried = typedDataFromPayload(wallet.qr[wallet.qr.length - 1])
    const signature = await signatureBy(GUARDIAN_ACCOUNT, carried)
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', `  ${signature}\n`)
    await page.press('guardian-offline-add')
    await finish()
    expect(wallet.signTypedData).not.toHaveBeenCalled()
    expect(page.has('guardian-signed')).toBe(true)
    await page.press('guardian-signed-copy')
    expect(wallet.copied).toHaveBeenLastCalledWith(lineOf(replyOf(request, signature)))
    page.unmount()
  })

  it('reads a signature by another key as the wrong signer', async () => {
    const page = await openOffline()
    const signature = await signatureBy(STRANGER_ACCOUNT, typedDataFor(requestOf()))
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', signature)
    await page.press('guardian-offline-add')
    await finish()
    expect(page.textOf('guardian-offline-wrongSigner')).toBe(t(`${OFFLINE}.wrongSigner`))
    expect(page.has('guardian-signed')).toBe(false)
    page.unmount()
  })

  it('reads bytes the approving side rejects as not a signature', async () => {
    const page = await openOffline()
    const signature = await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf()))
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', malformedSignature(signature))
    await page.press('guardian-offline-add')
    await finish()
    expect(kit.verify).toHaveBeenCalled()
    expect(page.textOf('guardian-offline-notASignature')).toBe(t(`${OFFLINE}.notASignature`))
    expect(page.has('guardian-signed')).toBe(false)
    page.unmount()
  })

  it('keeps the add action disabled while the account does not authorize the action', async () => {
    kit.isAuthorized.mockImplementation(async () => false)
    const page = await openOffline()
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', '0x1234')
    expect(page.isDisabled('guardian-offline-add')).toBe(true)
    await page.press('guardian-offline-add')
    expect(kit.replyFrom).not.toHaveBeenCalled()
    page.unmount()
  })

  it('gives way to the expired request once the deadline passes, with no add action', async () => {
    const page = await mountLive(requestOf({ validUntil: String(CREATED_AT + 90) }))
    await page.press('guardian-offline-open')
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', '0x1234')
    expect(page.isDisabled('guardian-offline-add')).toBe(false)
    await advance(MINUTE)
    await advance(31_000)
    expect(page.has('guardian-offline-add')).toBe(false)
    expect(page.has('guardian-dead-expired')).toBe(true)
    page.unmount()
  })

  it('is busy while the approving side packages the signature, and a second add asks nothing more', async () => {
    let packaged: () => void = () => {}
    kit.replyFrom.mockImplementation(
      (request, _input, material) =>
        new Promise((resolve) => {
          packaged = () => resolve(replyOf(request, (material as { signature: Hex }).signature))
        })
    )
    const page = await openOffline()
    const signature = await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf()))
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', signature)
    await page.press('guardian-offline-add')
    expect(page.isDisabled('guardian-offline-add')).toBe(true)
    await page.press('guardian-offline-add')
    expect(kit.replyFrom).toHaveBeenCalledTimes(1)
    packaged()
    await finish()
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('drops a pasted signature still being packaged when the guardian declines', async () => {
    let packaged: () => void = () => {}
    kit.replyFrom.mockImplementation(
      (request, _input, material) =>
        new Promise((resolve) => {
          packaged = () => resolve(replyOf(request, (material as { signature: Hex }).signature))
        })
    )
    const page = await openOffline()
    const signature = await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf()))
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', signature)
    await page.press('guardian-offline-add')
    expect(kit.replyFrom).toHaveBeenCalledTimes(1)
    await page.press('guardian-decline')
    expect(page.has('guardian-declined')).toBe(true)
    packaged()
    await finish()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.has('guardian-declined')).toBe(true)
    page.unmount()
  })

  it('reads garbage as not a signature and asks the approving side nothing', async () => {
    const page = await openOffline()
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', 'not a signature')
    await page.press('guardian-offline-add')
    await finish()
    expect(page.textOf('guardian-offline-notASignature')).toBe(t(`${OFFLINE}.notASignature`))
    expect(kit.replyFrom).not.toHaveBeenCalled()
    page.unmount()
  })

  it('reads a text the approving side cannot package as not a signature', async () => {
    kit.replyFrom.mockImplementation(async () => ({
      kind: 'reply-failure',
      cause: 'material-rejected'
    }))
    const page = await openOffline()
    await page.press('guardian-acknowledge')
    await page.type('guardian-offline-signature', '0xabcd')
    await page.press('guardian-offline-add')
    await finish()
    expect(page.textOf('guardian-offline-notASignature')).toBe(t(`${OFFLINE}.notASignature`))
    page.unmount()
  })

  it('goes back to the lead with the acknowledgment kept', async () => {
    const page = await openOffline()
    await page.press('guardian-acknowledge')
    await page.press('guardian-offline-back')
    expect(page.has('guardian-offline')).toBe(false)
    expect(page.has('guardian-lead')).toBe(true)
    expect(page.isDisabled('guardian-sign')).toBe(false)
    page.unmount()
  })
})

describe('the decline message', () => {
  it('copies the message naming the account and the new key', async () => {
    const page = await mountLive()
    await page.press('guardian-decline')
    expect(page.textOf('guardian-brand')).toBe(t(`${PAGE}.brand`))
    await page.press('guardian-declined-copy-message')
    expect(wallet.copied).toHaveBeenLastCalledWith(
      t(`${PAGE}.declined.message`, { account: ACCOUNT, newKey: NEW_KEY })
    )
    expect(page.textOf('guardian-declined-copy-message-copied')).toBe(
      t('socialRecovery.checklist.guardian.copied')
    )
    page.unmount()
  })

  it('says so where the clipboard refuses the copy', async () => {
    wallet.copied.mockImplementation(async () => false)
    const page = await mountLive()
    await page.press('guardian-decline')
    await page.press('guardian-declined-copy-message')
    expect(page.has('guardian-declined-copy-message-failed')).toBe(true)
    page.unmount()
  })
})

describe('another link opened in the same tab', () => {
  const other = requestOf({ payload: '0x123456', salt: '0x03' })
  const openOther = () => navigate(searchOf(linkOf(other)))

  it('drops the answer of a signature asked for the request it replaced', async () => {
    let answer: (signature: `0x${string}`) => void = () => {}
    wallet.signTypedData.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    const page = await mountTicked()
    await page.press('guardian-sign')
    expect(page.has('guardian-sign-busy')).toBe(true)
    await openOther()
    expect(page.has('guardian-sign-busy')).toBe(false)
    answer(await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(requestOf())))
    await finish()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.has('guardian-sign-block')).toBe(true)
    kit.replyFrom.mockClear()
    await page.press('guardian-acknowledge')
    expect(page.isDisabled('guardian-sign')).toBe(false)
    wallet.signTypedData.mockImplementation((_key, typedData) =>
      signatureBy(GUARDIAN_ACCOUNT, typedData)
    )
    await page.press('guardian-sign')
    await finish()
    expect(kit.replyFrom).toHaveBeenCalledTimes(1)
    expect(kit.replyFrom.mock.calls[0][0]).toEqual(other)
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it("withdraws the replaced request's sign request before the new request signs", async () => {
    const { answers, signals } = heldSignWindow()
    const page = await mountTicked()
    await page.press('guardian-sign')
    expect(signals[0]?.aborted).toBe(false)
    await openOther()
    expect(signals[0]?.aborted).toBe(true)
    await page.press('guardian-acknowledge')
    await page.press('guardian-sign')
    expect(wallet.signTypedData).toHaveBeenCalledTimes(2)
    expect(wallet.signTypedData.mock.calls[1][1]).toEqual(typedDataFor(other))
    expect(signals[1]?.aborted).toBe(false)
    answers[1](await signatureBy(GUARDIAN_ACCOUNT, typedDataFor(other)))
    await finish()
    expect(page.has('guardian-signed')).toBe(true)
    page.unmount()
  })

  it('opens the new request unsigned, and reads the chain again, after an approval', async () => {
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(page.has('guardian-signed')).toBe(true)
    const reads = kit.attemptState.mock.calls.length
    await openOther()
    expect(page.has('guardian-signed')).toBe(false)
    expect(page.has('guardian-sign-block')).toBe(true)
    await advance(3 * MINUTE)
    expect(kit.attemptState.mock.calls.length).toBeGreaterThan(reads)
    page.unmount()
  })

  it('shows no failure of the request it replaced', async () => {
    wallet.signTypedData.mockImplementation(async () => {
      throw signRefusal('refused')
    })
    const page = await mountTicked()
    await page.press('guardian-sign')
    await finish()
    expect(page.has('guardian-sign-refused')).toBe(true)
    await openOther()
    expect(page.has('guardian-sign-refused')).toBe(false)
    page.unmount()
  })

  it('opens the new request undeclined', async () => {
    const page = await mountLive()
    await page.press('guardian-decline')
    expect(page.has('guardian-declined-copy-message')).toBe(true)
    await openOther()
    expect(page.has('guardian-declined-copy-message')).toBe(false)
    expect(page.has('guardian-sign-block')).toBe(true)
    page.unmount()
  })
})
