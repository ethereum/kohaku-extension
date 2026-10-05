import en from '@common/config/localization/translations/en.json'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import * as display from '..'

const BANS: { rule: string; pattern: RegExp }[] = [
  { rule: 'policy', pattern: /\bpolic(?:y|ies)\b/i },
  { rule: 'proof', pattern: /\bproofs?\b/i },
  { rule: 'relayer', pattern: /\brelayers?\b/i },
  { rule: 'EIP-712', pattern: /\bEIP[-\s]?712\b/i },
  { rule: 'atomic', pattern: /\batomic(?:ally)?\b/i },
  { rule: 'Protected', pattern: /\bProtected\b/ },
  { rule: 'your people', pattern: /\byour\s+people\b/i },
  { rule: 'full wallet password', pattern: /\bfull\s+wallet\s+passwords?\b/i }
]

const collect = (value: unknown, out: string[] = [], seen = new Set<unknown>()): string[] => {
  if (typeof value === 'string') out.push(value)
  else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value)
    Object.values(value as Record<string, unknown>).forEach((v) => collect(v, out, seen))
  }
  return out
}

const hits = (strings: string[]) =>
  strings.flatMap((s) =>
    BANS.filter(({ pattern }) => pattern.test(s)).map(({ rule }) => `${rule}: ${s}`)
  )

const PAYEE: Address = '0x2b0f5e98ee98adc9865745e98802f333f72f6ef5'
const USDC: Address = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const ZERO: Address = '0x0000000000000000000000000000000000000000'
const TOKEN = { symbol: 'USDC', decimals: 6 }

const renderedVocabulary = (): string[] => [
  ...(Object.keys(display.CHIP_SETS) as display.ChipSetName[]).flatMap((set) =>
    (display.CHIP_SETS[set] as readonly string[]).map((chip) =>
      display.renderChip(set, chip as never)
    )
  ),
  ...[...display.KIT_NOUNS, ...display.CONCEPT_NOUNS, ...display.PARTY_NOUNS].map((noun) =>
    display.renderNoun(noun)
  ),
  ...display.PASSWORD_NAMES.map((name) => display.renderPasswordName(name)),
  ...display.VALUE_LABELS.map((label) => display.renderValueLabel(label)),
  ...display.WALLET_WORDS.map((word) => display.renderWalletWord(word)),
  ...display.APPROVAL_VALUES.flatMap((value) => [
    display.renderApprovalValueName(value),
    display.renderApprovalValueName(value, { doneScreen: true })
  ])
]

const renderedValues = (): string[] => {
  const hidden = display.renderHiddenValue()
  const members = display.renderMemberList(['a', 'b', 'c', 'd', 'e'])
  const names = display.NAME_USES.map((use) => display.renderResolvedName('alice.eth', use))
  const deadline = display.renderDeadline({
    deadline: new Date('2026-08-13T16:04:00Z'),
    now: new Date('2026-08-12T17:04:00Z'),
    timeZone: 'Europe/Berlin'
  })
  return [
    hidden.dots,
    hidden.chip,
    members.more ?? '',
    ...names.flatMap((n) => [n?.name ?? '', n?.caveat ?? '']),
    display.renderPaymentOrder(undefined, TOKEN),
    display.renderPaymentOrder({ token: USDC, amount: 12_500_000n, payee: PAYEE }, TOKEN),
    display.renderPaymentOrder({ token: USDC, amount: 12_500_000n, payee: ZERO }, TOKEN),
    deadline.line ?? '',
    display.renderCountdown({ remainingMs: 1000 }),
    display.renderCountdown({ remainingMs: 1000, stopped: true }),
    display.renderCountdown({ remainingMs: 0 }),
    display.renderCountdown({ remainingMs: 0, stopped: true })
  ]
}

describe('banned words in the display module', () => {
  it('no exported string, vocabulary or key carries a banned word', () => {
    const exported = collect(display)
    // The walk must reach the vocabularies, so an empty walk cannot pass silently.
    expect(exported).toEqual(
      expect.arrayContaining(['recoveryRegistry', 'notStarted', 'stillNeeded', 'guardian'])
    )
    expect(hits(exported)).toEqual([])
  })

  it('no rendered chip of any set, noun of any list, name or label carries a banned word', () => {
    const rendered = renderedVocabulary()
    // Samples from several lists, so an empty walk cannot pass silently.
    expect(rendered).toEqual(
      expect.arrayContaining([
        'Not submitted',
        'Setup changed',
        'Still needed',
        'Guardian',
        'The party that can stop that method',
        'Controlled by'
      ])
    )
    expect(hits(rendered)).toEqual([])
  })

  it('no rendered chip, noun or label says protect or unprotected', () => {
    expect(renderedVocabulary().filter((s) => /protect/i.test(s))).toEqual([])
  })

  it('no rendered value carries a banned word or says protect', () => {
    const rendered = renderedValues()
    expect(hits(rendered)).toEqual([])
    expect(rendered.filter((s) => /protect/i.test(s))).toEqual([])
  })

  it('no socialRecovery value in en.json carries Protected', () => {
    expect(collect(en.socialRecovery).filter((s) => /\bProtected\b/.test(s))).toEqual([])
  })
})
