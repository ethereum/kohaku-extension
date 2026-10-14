/**
 * @jest-environment jsdom
 *
 * A guardian row's artifact and its carriers: the four values in full above
 * the setup and attempt numbers, the carriers of the link locked until every
 * value rendered from a read that answered, the link and the message each
 * written to the clipboard as the guardian receives them, the QR code of the
 * link, and the approval page opened in a tab of its own. Only a row still
 * open carries any of it.
 */
import type {
  FakeKit,
  Mounted,
  TestRecords
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import {
  ACCOUNT,
  DESTINATION,
  depsOf,
  fakeKit,
  gatheringOf,
  HANDOVER,
  MIXED_PATH,
  mountChecklist,
  mountSwappableChecklist,
  qrDouble,
  REMOVED,
  requestOf,
  seedCache,
  seedEntry,
  seedSession,
  servedRequestOf,
  settle,
  t,
  TIME_ZONE,
  testRecords,
  withReplies
} from '@web/modules/social-recovery/recovery/checklist/__tests__/harness'
import type { DestinationReading } from '@web/modules/social-recovery/recovery/checklist/types'
import type { Address, Gathering } from '@web/modules/social-recovery/sdk-interfaces'
import { deferred } from '@web/modules/social-recovery/shared/chrome/__fixtures__/deferred'

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const { getAddress }: typeof import('viem') = require('viem')
const {
  WEB_ROUTES
}: typeof import('@common/modules/router/constants/common') = require('@common/modules/router/constants/common')
const clipboard: { setStringAsync: jest.Mock } = require('@common/utils/clipboard')
const {
  renderDateTimeInZone
}: typeof import('@web/modules/social-recovery/shared/display') = require('@web/modules/social-recovery/shared/display')
const {
  requestOfApprovalLink
}: typeof import('@web/modules/social-recovery/recovery/checklist') = require('@web/modules/social-recovery/recovery/checklist')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const GUARDIAN = 'socialRecovery.checklist.guardian'
const MESSAGE = 'socialRecovery.checklist.message'
const CARRIERS = ['open-page', 'copy-link', 'copy-message', 'show-qr'] as const

const BANNED: [string, RegExp][] = [
  ['recovery phrase', /\brecovery\s+phrases?\b/i],
  ['policy', /\bpolic(?:y|ies)\b/i],
  ['proof', /\bproofs?\b/i],
  ['relayer', /\brelayers?\b/i],
  ['EIP-712', /\bEIP[-\s]?712\b/i],
  ['atomic', /\batomic(?:ally)?\b/i],
  ['your people', /\byour\s+people\b/i],
  ['full wallet password', /\bfull\s+wallet\s+passwords?\b/i],
  ['Protected', /\bProtected\b/]
]

describe('the guardian row carriers', () => {
  let view: Mounted | undefined
  let world: TestRecords
  let kit: FakeKit
  let gathering: Gathering

  const open = async (destination?: DestinationReading) => {
    view?.unmount()
    view = await mountChecklist({
      records: world.records,
      client: kit.state,
      deps: depsOf(),
      destination
    })
    return view
  }

  const id = (place: number, name: string) => `checklist-row-${place}-${name}`
  const locked = (mounted: Mounted, place: number) =>
    CARRIERS.map((name) => mounted.isDisabled(id(place, name)))

  beforeEach(async () => {
    world = testRecords()
    gathering = gatheringOf(MIXED_PATH)
    await seedEntry(world.records)
    await seedCache(world.records, MIXED_PATH)
    await seedSession(world.records, gathering)
    kit = fakeKit(MIXED_PATH, { served: true })
    clipboard.setStringAsync.mockClear()
    clipboard.setStringAsync.mockImplementation(async () => true)
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
    jest.restoreAllMocks()
  })

  it('renders the four values in full, account first, then the setup and attempt numbers', async () => {
    const mounted = await open()

    const cells = Array.from(
      mounted.byTestId(id(1, 'values'))?.querySelectorAll('[data-testid^="checklist-row-1-"]') ?? []
    ).map((node) => node.getAttribute('data-testid'))
    expect(cells).toEqual([
      id(1, 'value-account'),
      id(1, 'value-newKey'),
      id(1, 'value-keyBeingRemoved'),
      id(1, 'value-payment'),
      id(1, 'setup-number'),
      id(1, 'attempt-number')
    ])
    expect(mounted.byTestId(id(1, 'value-account'))?.textContent).toBe(getAddress(ACCOUNT))
    expect(mounted.byTestId(id(1, 'value-newKey'))?.textContent).toBe(getAddress(DESTINATION))
    expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe(getAddress(REMOVED))
    expect(mounted.byTestId(id(1, 'value-payment'))?.textContent).toBe(
      t('socialRecovery.display.values.noPayment')
    )
    expect(mounted.byTestId(id(1, 'setup-number'))?.textContent).toBe(gathering.request.setupNonce)
    expect(mounted.byTestId(id(1, 'attempt-number'))?.textContent).toBe(gathering.request.attemptId)
    const block = mounted.byTestId(id(1, 'values'))?.textContent ?? ''
    ;['account', 'newKey', 'keyBeingRemoved', 'payment'].forEach((name) =>
      expect(block).toContain(t(`socialRecovery.display.values.${name}`))
    )
    expect(block).toContain(t('socialRecovery.display.nouns.setupNumber'))
    expect(block).toContain(t('socialRecovery.display.nouns.attemptNumber'))
  })

  it('tells the recoverer to ask for the call back, not place it, and to use a channel they already use', async () => {
    const mounted = await open()

    expect(mounted.byTestId(id(1, 'ask-call-back'))?.textContent).toBe(t(`${GUARDIAN}.askCallBack`))
    expect(mounted.byTestId(id(1, 'read-values'))?.textContent).toBe(t(`${GUARDIAN}.readValues`))
    expect(mounted.byTestId(id(1, 'send-message'))?.textContent).toBe(t(`${GUARDIAN}.sendMessage`))
  })

  it('unlocks every carrier and the approval page once the four values rendered', async () => {
    const mounted = await open()

    expect(locked(mounted, 1)).toEqual([false, false, false, false])
    expect(mounted.byTestId(id(1, 'unlock-reason'))).toBeNull()
  })

  it('keeps the carriers locked while the removed key is read, and unlocks them when it answers', async () => {
    const read = deferred<{ kind: 'named'; key: typeof REMOVED }>()
    kit.removedKey.mockImplementation(() => read.promise)
    const mounted = await open()

    expect(locked(mounted, 1)).toEqual([true, true, true, true])
    expect(mounted.byTestId(id(1, 'unlock-reason'))?.textContent).toBe(
      t(`${GUARDIAN}.unlockReason`)
    )
    expect(mounted.byTestId(id(1, 'link'))).toBeNull()
    expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe('')
    await mounted.press(id(1, 'copy-link'))
    await mounted.press(id(1, 'copy-message'))
    await mounted.press(id(1, 'show-qr'))
    expect(clipboard.setStringAsync).not.toHaveBeenCalled()
    expect(mounted.byTestId(id(1, 'qr'))).toBeNull()

    read.resolve({ kind: 'named', key: REMOVED })
    await settle()

    expect(locked(mounted, 1)).toEqual([false, false, false, false])
    expect(mounted.byTestId(id(1, 'unlock-reason'))).toBeNull()
  })

  it('keeps the carriers locked on a failed read of the removed key, and unlocks them after the retry', async () => {
    kit.removedKey.mockRejectedValueOnce(new Error('rpc down'))
    const mounted = await open()

    expect(locked(mounted, 1)).toEqual([true, true, true, true])
    expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toContain(
      t('socialRecovery.checklist.guardian.removedKeyReadFailed')
    )

    await mounted.press(id(1, 'removed-retry'))

    expect(kit.removedKey).toHaveBeenCalledTimes(2)
    expect(locked(mounted, 1)).toEqual([false, false, false, false])
    expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe(getAddress(REMOVED))
  })

  it('names a removed key the wallet cannot read, keeps the carriers locked and offers no retry', async () => {
    kit.removedKey.mockResolvedValue({ kind: 'unavailable', cause: 'several-key-entries' })
    const mounted = await open()

    expect(mounted.byTestId(id(1, 'removed-unavailable'))?.textContent).toBe(
      t('socialRecovery.checklist.guardian.removedKeyUnavailable')
    )
    expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe(
      t('socialRecovery.checklist.guardian.removedKeyUnavailable')
    )
    expect(mounted.byTestId(id(1, 'removed-retry'))).toBeNull()
    expect(locked(mounted, 1)).toEqual([true, true, true, true])
    expect(mounted.byTestId(id(1, 'unlock-reason'))?.textContent).toBe(
      t(`${GUARDIAN}.unlockReason`)
    )
    expect(mounted.byTestId(id(1, 'link'))).toBeNull()
    await mounted.press(id(1, 'copy-link'))
    await mounted.press(id(1, 'show-qr'))
    await settle()
    expect(clipboard.setStringAsync).not.toHaveBeenCalled()
    expect(mounted.byTestId(id(1, 'qr'))).toBeNull()
    expect(kit.removedKey).toHaveBeenCalledTimes(1)
  })

  it('offers the retry on a failed read of the removed key, not the line of an unreadable one', async () => {
    kit.removedKey.mockRejectedValueOnce(new Error('rpc down'))
    const mounted = await open()

    expect(mounted.byTestId(id(1, 'removed-retry'))).not.toBeNull()
    expect(mounted.byTestId(id(1, 'removed-unavailable'))).toBeNull()
  })

  it('keeps the carriers locked while the new key is still read', async () => {
    const mounted = await open({ status: 'loading' })

    expect(locked(mounted, 1)).toEqual([true, true, true, true])
    expect(mounted.byTestId(id(1, 'unlock-reason'))).not.toBeNull()
  })

  it('reads no payment and unlocks the carriers where the request names no order', async () => {
    kit = fakeKit(MIXED_PATH)
    kit.getApproverRequests.mockImplementation((of: Gathering) =>
      of.places.map((place) => ({ ...requestOf(of, place.place), payload: HANDOVER }))
    )
    const mounted = await open()

    expect(mounted.byTestId(id(1, 'value-payment'))?.textContent).toBe(
      t('socialRecovery.display.values.noPayment')
    )
    expect(locked(mounted, 1)).toEqual([false, false, false, false])
    expect(mounted.byTestId(id(1, 'unlock-reason'))).toBeNull()
  })

  it('cuts a link the approval page reads back where the request carries the handover bytes and no order', async () => {
    const withoutOrder = (of: Gathering, place: number) => {
      const request = servedRequestOf(of, place)
      delete request.order
      return request
    }
    kit.getApproverRequests.mockImplementation((of: Gathering) =>
      of.places.map((place) => withoutOrder(of, place.place))
    )
    const mounted = await open()

    expect(mounted.byTestId(id(1, 'value-payment'))?.textContent).toBe(
      t('socialRecovery.display.values.noPayment')
    )
    await mounted.press(id(1, 'copy-link'))

    expect(clipboard.setStringAsync).toHaveBeenCalledTimes(1)
    const [written] = clipboard.setStringAsync.mock.calls[0]
    const read = requestOfApprovalLink(written)
    expect(read).toEqual(withoutOrder(gathering, 1))
    expect(read).not.toHaveProperty('order')
  })

  it('says how the guardian answers under the values, above the link line and the carriers', async () => {
    const mounted = await open()
    const expected = [id(1, 'values'), id(1, 'how-they-answer'), id(1, 'link'), id(1, 'open-page')]

    const rendered = Array.from(
      mounted.byTestId(id(1, 'carriers'))?.querySelectorAll('[data-testid]') ?? []
    )
      .map((node) => node.getAttribute('data-testid') ?? '')
      .filter((testId) => expected.includes(testId))
    expect(rendered).toEqual(expected)
    expect(mounted.byTestId(id(1, 'how-they-answer'))?.textContent).toBe(
      t(`${GUARDIAN}.offlineBlock`)
    )
    expect(
      (mounted.byTestId(id(1, 'carriers'))?.textContent ?? '').split(t(`${GUARDIAN}.offlineBlock`))
    ).toHaveLength(2)
  })

  it('writes the link to the clipboard, a link that reads back to the place request', async () => {
    const mounted = await open()

    await mounted.press(id(1, 'copy-link'))

    expect(clipboard.setStringAsync).toHaveBeenCalledTimes(1)
    const [written] = clipboard.setStringAsync.mock.calls[0]
    expect(written).toBe(mounted.byTestId(id(1, 'link'))?.textContent)
    expect(written).toContain(`#/${WEB_ROUTES.socialRecoveryApprove}?`)
    expect(requestOfApprovalLink(written)).toEqual(servedRequestOf(gathering, 1))
    expect(mounted.byTestId(id(1, 'copy-link-copied'))?.textContent).toBe(t(`${GUARDIAN}.copied`))
  })

  it('cuts each row its own link, for its own place', async () => {
    const mounted = await open()

    await mounted.press(id(3, 'copy-link'))

    const [written] = clipboard.setStringAsync.mock.calls[0]
    expect(requestOfApprovalLink(written)).toEqual(servedRequestOf(gathering, 3))
  })

  it('says the copy failed where the clipboard refuses, and where it throws', async () => {
    clipboard.setStringAsync.mockResolvedValueOnce(false)
    const mounted = await open()

    await mounted.press(id(1, 'copy-link'))
    expect(mounted.byTestId(id(1, 'copy-link-failed'))?.textContent).toBe(
      t(`${GUARDIAN}.copyFailed`)
    )

    clipboard.setStringAsync.mockRejectedValueOnce(new Error('denied'))
    await mounted.press(id(1, 'copy-message'))
    expect(mounted.byTestId(id(1, 'copy-message-failed'))?.textContent).toBe(
      t(`${GUARDIAN}.copyFailed`)
    )
  })

  describe('the message', () => {
    const copiedMessage = async () => {
      const mounted = await open()
      await mounted.press(id(1, 'copy-message'))
      expect(clipboard.setStringAsync).toHaveBeenCalledTimes(1)
      expect(mounted.byTestId(id(1, 'copy-message-copied'))).not.toBeNull()
      return {
        message: clipboard.setStringAsync.mock.calls[0][0] as string,
        link: mounted.byTestId(id(1, 'link'))?.textContent ?? ''
      }
    }

    it('carries the link the row shows', async () => {
      const { message, link } = await copiedMessage()

      expect(link).not.toBe('')
      expect(message).toContain(link)
    })

    it('names the deadline as the date the checklist renders', async () => {
      const { message } = await copiedMessage()
      const date = renderDateTimeInZone(Number(gathering.request.validUntil) * 1000, TIME_ZONE).date

      expect(message).toContain(date)
      expect(message).toContain(t(`${MESSAGE}.deadline`, { deadline: date }))
    })

    it('names the install with its source and the publisher to check there', async () => {
      const { message } = await copiedMessage()

      expect(message).toContain(t(`${MESSAGE}.sourceName`))
      expect(message).toContain(t(`${MESSAGE}.publisherName`))
      expect(message).toContain(
        t(`${MESSAGE}.install`, {
          source: t(`${MESSAGE}.sourceName`),
          publisher: t(`${MESSAGE}.publisherName`)
        })
      )
    })

    it('asks for a call back on a number already held, to compare the account and the new key', async () => {
      const { message } = await copiedMessage()
      const callBack = t(`${MESSAGE}.callBack`)

      expect(message).toContain(callBack)
      expect(callBack).toMatch(/call me back on a number you already have/i)
      expect(callBack).toMatch(/account and the new key/i)
      expect(callBack).toMatch(/compare/i)
      expect(message).toContain(t(`${MESSAGE}.callReceived`))
    })

    it('says the link is not to be forwarded, and that the approval comes back as one line', async () => {
      const { message } = await copiedMessage()

      expect(message).toContain(t(`${MESSAGE}.doNotForward`))
      expect(t(`${MESSAGE}.doNotForward`)).toMatch(/do not forward/i)
      expect(message).toContain(t(`${MESSAGE}.reply`))
      expect(t(`${MESSAGE}.reply`)).toMatch(/one line/i)
    })

    it('reads in the fixed order, one paragraph per part', async () => {
      const { message, link } = await copiedMessage()
      const date = renderDateTimeInZone(Number(gathering.request.validUntil) * 1000, TIME_ZONE).date

      expect(message.split('\n\n')).toEqual([
        t(`${MESSAGE}.intro`),
        t(`${MESSAGE}.install`, {
          source: t(`${MESSAGE}.sourceName`),
          publisher: t(`${MESSAGE}.publisherName`)
        }),
        t(`${MESSAGE}.openLink`, { link }),
        t(`${MESSAGE}.doNotForward`),
        t(`${MESSAGE}.callBack`),
        t(`${MESSAGE}.callReceived`),
        t(`${MESSAGE}.approveOnPage`),
        t(`${MESSAGE}.deadline`, { deadline: date }),
        t(`${MESSAGE}.submittable`),
        t(`${MESSAGE}.reply`)
      ])
    })

    it('uses no banned word', async () => {
      const { message, link } = await copiedMessage()
      const words = message.split(link).join(' ')

      BANNED.forEach(([term, pattern]) => {
        if (pattern.test(words)) {
          throw new Error(`the message uses "${term}"`)
        }
      })
    })
  })

  it('shows the QR code of the link in place, and hides it again', async () => {
    const mounted = await open()
    expect(mounted.byTestId(id(1, 'qr'))).toBeNull()

    await mounted.press(id(1, 'show-qr'))

    const qr = mounted.byTestId(id(1, 'qr'))?.querySelector('[data-testid="challenge-qr"]')
    expect(qr?.getAttribute('data-value')).toBe(mounted.byTestId(id(1, 'link'))?.textContent)
    expect(requestOfApprovalLink(qr?.getAttribute('data-value') ?? '')).toEqual(
      servedRequestOf(gathering, 1)
    )

    await mounted.press(id(1, 'show-qr'))
    expect(mounted.byTestId(id(1, 'qr'))).toBeNull()
  })

  it('opens the approval page on the link in a tab of its own, and stays on the checklist', async () => {
    const opened = jest.spyOn(window, 'open').mockImplementation(() => null)
    const mounted = await open()

    await mounted.press(id(1, 'open-page'))

    expect(opened).toHaveBeenCalledTimes(1)
    expect(opened.mock.calls[0][0]).toBe(mounted.byTestId(id(1, 'link'))?.textContent)
    expect(opened.mock.calls[0][1]).toBe('_blank')
    expect(mounted.navigate).not.toHaveBeenCalled()
    expect(mounted.byTestId('checklist-rows')).not.toBeNull()
  })

  it('carries the link and the paste field on a not-asked row', async () => {
    const mounted = await open()

    ;[1, 2, 3, 4].forEach((place) => {
      expect(mounted.byTestId(id(place, 'carriers'))).not.toBeNull()
      expect(mounted.byTestId(id(place, 'paste'))).not.toBeNull()
    })
  })

  it('carries them on a row marked declined and on one marked unanswered', async () => {
    const mounted = await open()

    await mounted.press(id(1, 'mark-declined'))
    await mounted.press(id(2, 'mark-unanswered'))
    ;[1, 2].forEach((place) => {
      expect(mounted.byTestId(id(place, 'carriers'))).not.toBeNull()
      expect(mounted.byTestId(id(place, 'paste'))).not.toBeNull()
    })
  })

  it('carries neither on a complete row nor on a row the rule no longer needs', async () => {
    world = testRecords()
    await seedEntry(world.records)
    await seedCache(world.records, MIXED_PATH)
    await seedSession(world.records, withReplies(gathering, [0, 1, 2, 3]))
    const mounted = await open()

    expect(mounted.byTestId(id(1, 'verified'))).not.toBeNull()
    ;[1, 2, 3, 4].forEach((place) => {
      expect(mounted.byTestId(id(place, 'carriers'))).toBeNull()
      expect(mounted.byTestId(id(place, 'paste'))).toBeNull()
    })
    expect(mounted.byTestId(id(4, 'chip'))?.textContent).toBe(
      t('socialRecovery.status.collection.notNeeded')
    )
  })

  it('names the toggle hide the QR code while the code shows, and show it once hidden', async () => {
    const mounted = await open()
    expect(mounted.byTestId(id(1, 'show-qr'))?.textContent).toBe(t(`${GUARDIAN}.showQr`))

    await mounted.press(id(1, 'show-qr'))
    expect(mounted.byTestId(id(1, 'show-qr'))?.textContent).toBe(t(`${GUARDIAN}.hideQr`))

    await mounted.press(id(1, 'show-qr'))
    expect(mounted.byTestId(id(1, 'show-qr'))?.textContent).toBe(t(`${GUARDIAN}.showQr`))
  })

  it('says the QR code could not be drawn where the code fails, and draws it again on a new toggle', async () => {
    qrDouble.fails = true
    const mounted = await open()

    await mounted.press(id(1, 'show-qr'))

    expect(mounted.byTestId(id(1, 'qr'))).toBeNull()
    expect(mounted.byTestId(id(1, 'qr-failed'))?.textContent).toBe(t(`${GUARDIAN}.qrFailed`))
    expect(mounted.byTestId(id(1, 'link'))?.textContent).not.toBe('')

    qrDouble.fails = false
    await mounted.press(id(1, 'show-qr'))
    expect(mounted.byTestId(id(1, 'qr-failed'))).toBeNull()
    await mounted.press(id(1, 'show-qr'))
    expect(mounted.byTestId(id(1, 'qr-failed'))).toBeNull()
    expect(mounted.byTestId(id(1, 'qr'))).not.toBeNull()
  })

  it('keeps the carriers locked with the unlock reason where an approval request has no handover bytes', async () => {
    kit.getApproverRequests.mockImplementation((of: Gathering) =>
      of.places.map((place) => {
        const request = servedRequestOf(of, place.place)
        delete request.payload
        return request
      })
    )
    const mounted = await open()

    expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe(getAddress(REMOVED))
    expect(locked(mounted, 1)).toEqual([true, true, true, true])
    expect(mounted.byTestId(id(1, 'unlock-reason'))?.textContent).toBe(
      t(`${GUARDIAN}.unlockReason`)
    )
    expect(mounted.byTestId(id(1, 'link'))).toBeNull()
    await mounted.press(id(1, 'copy-link'))
    await mounted.press(id(1, 'copy-message'))
    await mounted.press(id(1, 'show-qr'))
    expect(clipboard.setStringAsync).not.toHaveBeenCalled()
    expect(mounted.byTestId(id(1, 'qr'))).toBeNull()
    expect(qrDouble.drawn).toEqual([])
  })

  it('keeps the carriers locked with the unlock reason where the order pays a token the row cannot name', async () => {
    kit.getApproverRequests.mockImplementation((of: Gathering) =>
      of.places.map((place) => ({
        ...servedRequestOf(of, place.place),
        order: {
          token: '0x8000000000000000000000000000000000000001',
          amount: '5000',
          payee: '0x8000000000000000000000000000000000000002'
        }
      }))
    )
    const mounted = await open()

    expect(mounted.byTestId(id(1, 'value-payment'))?.textContent).not.toBe(
      t('socialRecovery.display.values.noPayment')
    )
    expect(locked(mounted, 1)).toEqual([true, true, true, true])
    expect(mounted.byTestId(id(1, 'unlock-reason'))?.textContent).toBe(
      t(`${GUARDIAN}.unlockReason`)
    )
    expect(mounted.byTestId(id(1, 'link'))).toBeNull()
    await mounted.press(id(1, 'copy-link'))
    expect(clipboard.setStringAsync).not.toHaveBeenCalled()
  })

  it('cuts a link without a field the client adds beside the declared ones', async () => {
    kit.getApproverRequests.mockImplementation((of: Gathering) =>
      of.places.map((place) => ({
        ...servedRequestOf(of, place.place),
        setupBody: of.request.setupBody
      }))
    )
    const mounted = await open()

    await mounted.press(id(1, 'copy-link'))

    const [written] = clipboard.setStringAsync.mock.calls[0]
    const carried =
      new URLSearchParams(written.slice(written.indexOf('?') + 1)).get('request') ?? ''
    const json = JSON.parse(Buffer.from(carried, 'base64url').toString('utf8'))
    expect(json).not.toHaveProperty('setupBody')
    expect(json.setupBodyHash).toBe(servedRequestOf(gathering, 1).setupBodyHash)
    expect(requestOfApprovalLink(written)).toEqual(servedRequestOf(gathering, 1))
  })

  describe('after the kit is rebuilt', () => {
    const OTHER_REMOVED: Address = '0x6666666666666666666666666666666666666667'
    const REBUILT_HANDOVER = '0x123456'

    /** A second kit over the same path, whose requests carry other handover bytes. */
    const rebuiltKit = () => {
      const next = fakeKit(MIXED_PATH, { served: true })
      next.getApproverRequests.mockImplementation((of: Gathering) =>
        of.places.map((place) => ({
          ...servedRequestOf(of, place.place),
          payload: REBUILT_HANDOVER
        }))
      )
      return next
    }

    const fromRebuilt = (value: string) =>
      requestOfApprovalLink(value)?.payload === REBUILT_HANDOVER

    const openSwappable = async () => {
      const mounted = await mountSwappableChecklist({
        records: world.records,
        client: kit.state,
        deps: depsOf()
      })
      view = mounted
      return mounted
    }

    it('locks the carriers as loading until the new kit reads the removed key, then shows its reading', async () => {
      const mounted = await openSwappable()
      await mounted.press(id(1, 'show-qr'))
      expect(locked(mounted, 1)).toEqual([false, false, false, false])
      expect(mounted.byTestId(id(1, 'qr'))).not.toBeNull()

      const next = rebuiltKit()
      const read = deferred<{ kind: 'named'; key: Address }>()
      next.removedKey.mockImplementation(() => read.promise)
      await mounted.swapClient(next.state)

      expect(next.removedKey).toHaveBeenCalledTimes(1)
      expect(locked(mounted, 1)).toEqual([true, true, true, true])
      expect(mounted.byTestId(id(1, 'unlock-reason'))?.textContent).toBe(
        t(`${GUARDIAN}.unlockReason`)
      )
      expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe('')
      expect(mounted.byTestId(id(1, 'link'))).toBeNull()
      expect(mounted.byTestId(id(1, 'qr'))).toBeNull()
      expect(qrDouble.drawn.filter(fromRebuilt)).toEqual([])

      read.resolve({ kind: 'named', key: OTHER_REMOVED })
      await settle()

      expect(locked(mounted, 1)).toEqual([false, false, false, false])
      expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe(
        getAddress(OTHER_REMOVED)
      )
      const qr = mounted.byTestId(id(1, 'qr'))?.querySelector('[data-testid="challenge-qr"]')
      expect(fromRebuilt(qr?.getAttribute('data-value') ?? '')).toBe(true)
    })

    it('never shows the reading of the kit it replaced, even when that read answers late', async () => {
      const first = deferred<{ kind: 'named'; key: Address }>()
      kit.removedKey.mockImplementation(() => first.promise)
      const mounted = await openSwappable()

      const next = rebuiltKit()
      const second = deferred<{ kind: 'named'; key: Address }>()
      next.removedKey.mockImplementation(() => second.promise)
      await mounted.swapClient(next.state)
      first.resolve({ kind: 'named', key: REMOVED })
      await settle()

      expect(locked(mounted, 1)).toEqual([true, true, true, true])
      expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe('')

      second.resolve({ kind: 'named', key: OTHER_REMOVED })
      await settle()

      expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe(
        getAddress(OTHER_REMOVED)
      )
      expect(locked(mounted, 1)).toEqual([false, false, false, false])
    })

    it('reads the removed key again for a kit it held before, not the reading kept from then', async () => {
      const mounted = await openSwappable()
      await mounted.swapClient(rebuiltKit().state)
      expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe(
        getAddress(REMOVED)
      )

      const again = deferred<{ kind: 'named'; key: Address }>()
      kit.removedKey.mockImplementation(() => again.promise)
      await mounted.swapClient(kit.state)

      expect(kit.removedKey).toHaveBeenCalledTimes(2)
      expect(locked(mounted, 1)).toEqual([true, true, true, true])
      expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe('')

      again.resolve({ kind: 'named', key: OTHER_REMOVED })
      await settle()
      expect(mounted.byTestId(id(1, 'value-keyBeingRemoved'))?.textContent).toBe(
        getAddress(OTHER_REMOVED)
      )
    })
  })
})
