/**
 * @jest-environment jsdom
 *
 * The guardian's checks read as good, worth a look or a risk, each line with
 * an icon in its tone beside its text; and the passkey name and the guardian
 * address take a neutral focus, not the colours of an error.
 */
import type { Address, Clause, Hex } from '@kohaku-eth/social-recovery'

import type {
  CheckTone,
  EnrollSearch,
  GuardianChain,
  GuardianChecks,
  HeldKey
} from '@web/modules/social-recovery/setup/enroll/types'
import type { FakeDeps, Mounted } from '@web/modules/social-recovery/setup/enroll/__tests__/harness'
import {
  asRendered,
  depsOf,
  each,
  emptySlot,
  mountView,
  pathWith,
  recordsWith,
  settle,
  t,
  THEME
} from '@web/modules/social-recovery/setup/enroll/__tests__/harness'

// The spinner's animation needs a native module jsdom lacks; a plain view stands in.
jest.mock('@common/components/Spinner', () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const mockReact: typeof import('react') = require('react')
  const { View: MockView }: typeof import('react-native') = require('react-native')
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */
  return {
    __esModule: true,
    default: () => mockReact.createElement(MockView, { testID: 'spinner' })
  }
})

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const {
  checkLinesOf,
  seedCheckOf
}: typeof import('@web/modules/social-recovery/setup/enroll/guardian') = require('@web/modules/social-recovery/setup/enroll/guardian')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const GUARDIAN = 'socialRecovery.enroll.guardian'

const HELD: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const LOWERCASE = HELD.toLowerCase() as Address
/** The checksummed address with the case of one letter turned. */
const WRONG_CASE = HELD.replace('C', 'c') as Address

const GUARDIAN_PATH: Clause[] = [
  { threshold: 1, credentials: [emptySlot('passkey')] },
  { threshold: 1, credentials: [emptySlot('ecdsa'), emptySlot('ecdsa')] }
]
const GUARDIAN_SEARCH: EnrollSearch = { kind: 'ecdsa', at: { clause: 1, member: 1 } }
const PASSKEY_SEARCH: EnrollSearch = { kind: 'passkey', at: { clause: 0, member: 1 } }

const contractCode: GuardianChain = {
  readCode: async (): Promise<Hex> => '0x6080',
  isValidSignature: async () => false
}
const sameSeed = [{ addr: LOWERCASE, type: 'internal' as const, fromSeedId: 'seed-1' }]

describe('the tone of each check line', () => {
  each<[string, GuardianChecks, string, CheckTone]>([
    ['a checksum that holds', { checksum: 'ok' }, 'checksumOk', 'good'],
    ['a checksum that fails', { checksum: 'failed' }, 'checksumFailed', 'risk'],
    [
      'a name that resolves',
      { name: { status: 'resolved', name: 'bluejay.eth', address: HELD } },
      'nameResolves',
      'good'
    ],
    ['a name that does not resolve', { name: { status: 'unresolved' } }, 'nameUnresolved', 'risk'],
    ['an address with no code', { code: 'none' }, 'noCode', 'good'],
    ['an address with code', { code: 'contract' }, 'smartAccountDetected', 'warning'],
    ['a key this wallet does not hold', { seed: 'not' }, 'notSameSeed', 'good'],
    ['a key from the same seed', { seed: 'same' }, 'sameSeed', 'risk'],
    [
      "a key this wallet holds apart from the account's seed",
      { seed: 'held' },
      'heldHere',
      'warning'
    ]
  ])('reads %s in its tone', ([, checks, key, tone]) => {
    expect(checkLinesOf(checks).map((line) => [line.key, line.tone])).toEqual([
      [`${GUARDIAN}.${key}`, tone]
    ])
  })

  it('keeps every line in its tone when every check reads at once', () => {
    const lines = checkLinesOf({
      checksum: 'failed',
      name: { status: 'resolved', name: 'bluejay.eth', address: HELD },
      code: 'contract',
      seed: 'same'
    })
    expect(lines.map((line) => [line.key, line.tone])).toEqual([
      [`${GUARDIAN}.checksumFailed`, 'risk'],
      [`${GUARDIAN}.nameResolves`, 'good'],
      [`${GUARDIAN}.smartAccountDetected`, 'warning'],
      [`${GUARDIAN}.sameSeed`, 'risk']
    ])
    expect(lines[1].values).toEqual({ name: 'bluejay.eth' })
  })
})

describe('the seed check by the kind of key the wallet keeps at the address', () => {
  const OTHER: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
  each<[string, HeldKey[], NonNullable<GuardianChecks['seed']>]>([
    ['no key at all', [], 'not'],
    [
      'a stored key at another address',
      [{ addr: OTHER, type: 'internal', fromSeedId: 'seed-1' }],
      'not'
    ],
    [
      "a stored key from the account's seed",
      [{ addr: HELD, type: 'internal', fromSeedId: 'seed-1' }],
      'same'
    ],
    [
      'a stored key from another seed',
      [{ addr: HELD, type: 'internal', fromSeedId: 'seed-2' }],
      'held'
    ],
    ['a stored key imported alone', [{ addr: LOWERCASE, type: 'internal' }], 'held'],
    ['a Ledger key', [{ addr: HELD, type: 'ledger' }], 'not'],
    ['a Trezor key', [{ addr: HELD, type: 'trezor' }], 'not'],
    ['a Lattice key', [{ addr: HELD, type: 'lattice' }], 'not'],
    [
      'a hardware key beside a stored key from another seed',
      [
        { addr: HELD, type: 'ledger' },
        { addr: HELD, type: 'internal', fromSeedId: 'seed-2' }
      ],
      'held'
    ]
  ])('reads %s', ([, keys, seed]) => {
    expect(seedCheckOf(keys, ['seed-1'], HELD)).toBe(seed)
  })

  it('draws the not-same-seed line, not the held line, for a hardware key at the address', async () => {
    const view = await mountView({
      records: (await recordsWith(GUARDIAN_PATH)).records,
      search: GUARDIAN_SEARCH,
      deps: depsOf({ keys: [{ addr: HELD, type: 'ledger' }], ownSeedIds: ['seed-1'] })
    })
    try {
      await view.type('guardian-address', HELD)
      await settle(450)
      const text = view.byTestId('guardian-checks')?.textContent ?? ''
      expect(text).toContain(t(`${GUARDIAN}.notSameSeed`))
      expect(text).not.toContain(t(`${GUARDIAN}.heldHere`))
    } finally {
      view.unmount()
    }
  })
})

describe('the enrollment fields and checks', () => {
  let view: Mounted | undefined
  let deps: FakeDeps

  beforeEach(() => {
    deps = depsOf()
  })

  afterEach(() => {
    view?.unmount()
    view = undefined
  })

  const open = async (clauses: Clause[], search: EnrollSearch) => {
    const { records } = await recordsWith(clauses)
    view = await mountView({ records, search, deps })
    return view
  }

  /** Types a value in the guardian field, then waits past the pause before a name resolves. */
  const enter = async (value: string) => {
    await view!.type('guardian-address', value)
    await settle(450)
  }

  /** Each check line: its text, the icon beside it and the colour the icon is drawn in. */
  const drawnLines = () =>
    Array.from(
      view!
        .byTestId('guardian-checks')
        ?.querySelectorAll<HTMLElement>('[data-testid="guardian-check"]') ?? [],
      (text) => {
        const icons = text.parentElement?.querySelectorAll('svg') ?? []
        const icon = icons[0]
        const painted = icon?.querySelector('[fill]:not([fill="none"]):not(g), [stroke]')
        return {
          text: text.textContent,
          icons: icons.length,
          testID: icon?.getAttribute('data-testid'),
          colour: painted?.getAttribute('stroke') ?? painted?.getAttribute('fill')
        }
      }
    )

  const iconOf = (tone: CheckTone, colour: string) => ({
    icons: 1,
    testID: `guardian-check-icon-${tone}`,
    colour
  })
  const good = iconOf('good', THEME.successDecorative as string)
  const warning = iconOf('warning', THEME.warningDecorative as string)
  const risk = iconOf('risk', THEME.errorDecorative as string)

  describe('the check lines', () => {
    it('draws a good icon beside each line of an address that passes every check', async () => {
      await open(GUARDIAN_PATH, GUARDIAN_SEARCH)
      await enter(HELD)
      expect(drawnLines()).toEqual([
        { text: t(`${GUARDIAN}.checksumOk`), ...good },
        { text: t(`${GUARDIAN}.noCode`), ...good },
        { text: t(`${GUARDIAN}.notSameSeed`), ...good }
      ])
      expect(view!.byTestId('guardian-checks')?.querySelectorAll('svg')).toHaveLength(3)
      expect(view!.byTestId('guardian-checks')?.textContent).toContain(t(`${GUARDIAN}.advisory`))
    })

    it('draws a risk or a warning icon beside each line of the worst address, and still adds it', async () => {
      deps = depsOf({ chain: contractCode, keys: sameSeed, ownSeedIds: ['seed-1'] })
      await open(GUARDIAN_PATH, GUARDIAN_SEARCH)
      await enter(WRONG_CASE)
      expect(drawnLines()).toEqual([
        { text: t(`${GUARDIAN}.checksumFailed`), ...risk },
        { text: t(`${GUARDIAN}.smartAccountDetected`), ...warning },
        { text: t(`${GUARDIAN}.sameSeed`), ...risk }
      ])
      expect(view!.byTestId('guardian-checks')?.querySelectorAll('svg')).toHaveLength(3)
      expect(view!.byTestId('guardian-checks')?.textContent).toContain(t(`${GUARDIAN}.advisory`))
      expect(view!.isDisabled('guardian-add')).toBe(false)
    })

    it('draws a good icon beside a resolved name', async () => {
      deps = depsOf({ resolveName: async (name) => (name === 'bluejay.eth' ? HELD : '') })
      await open(GUARDIAN_PATH, GUARDIAN_SEARCH)
      await enter('bluejay.eth')
      expect(drawnLines()).toContainEqual({
        text: t(`${GUARDIAN}.nameResolves`, { name: 'bluejay.eth' }),
        ...good
      })
    })

    it('draws a risk icon beside a name that does not resolve', async () => {
      await open(GUARDIAN_PATH, GUARDIAN_SEARCH)
      await enter('nobody.eth')
      expect(drawnLines()).toEqual([{ text: t(`${GUARDIAN}.nameUnresolved`), ...risk }])
      expect(view!.byTestId('guardian-checks')?.textContent).toContain(t(`${GUARDIAN}.advisory`))
    })
  })

  describe('the focus of a field', () => {
    each([
      ['the guardian address', 'guardian-address', GUARDIAN_PATH, GUARDIAN_SEARCH],
      [
        'the passkey name',
        'passkey-name',
        pathWith(emptySlot('passkey'), emptySlot('passkey')),
        PASSKEY_SEARCH
      ]
    ] as const)(
      'draws %s focused in neutral colours, and drops them on blur',
      async ([, id, clauses, search]) => {
        await open([...clauses], search)
        const resting = view!.bordersOf(id)
        view!.focus(id)
        const focused = view!.bordersOf(id)
        expect(focused).toEqual({
          inner: asRendered(THEME.primary as string),
          outer: asRendered(THEME.primaryBorder as string)
        })
        expect([focused.inner, focused.outer]).not.toContain(asRendered(THEME.linkText as string))
        expect([focused.inner, focused.outer]).not.toContain(
          asRendered(THEME.errorDecorative as string)
        )
        expect([focused.inner, focused.outer]).not.toContain(
          asRendered(THEME.infoBackground as string)
        )
        view!.blur(id)
        expect(view!.bordersOf(id)).toEqual(resting)
      }
    )
  })
})
