/**
 * The value renderers: one form per value type on every recovery surface, so a
 * reader never learns two truncations for one thing.
 *
 * Every function here is pure: it reads no clock, no zone and no storage, and
 * takes `now` and the zone as parameters. Strings come from `t`.
 */
import { formatUnits, getAddress, isAddress, isHex, zeroAddress } from 'viem'

import i18n from '@common/config/localization'
import type { Address, Hex, PaymentOrder } from '@web/modules/social-recovery/sdk-interfaces'

import type {
  CountdownState,
  NameUse,
  PaymentToken,
  RenderedDeadline,
  RenderedHiddenValue,
  RenderedMemberList,
  RenderedName,
  Translate
} from './types'
import { renderChip, renderValueLabel } from './vocabulary'

/** The one ellipsis every truncation uses. */
export const ELLIPSIS = '…'

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/**
 * The address checksummed (EIP-55). An all-lowercase or all-uppercase address
 * is checksummed; a mixed-case address must already carry its own checksum, so
 * a mistyped one is refused instead of silently re-checksummed. Throws a
 * TypeError on a value that is not a 20-byte hex address or whose mixed case
 * fails its checksum.
 */
export const checksumAddress = (address: Address): Address => {
  if (!isAddress(address, { strict: false })) {
    throw new TypeError(`Not an address: ${address}`)
  }
  const checksummed = getAddress(address)
  const digits = address.slice(2)
  const mixedCase = digits !== digits.toLowerCase() && digits !== digits.toUpperCase()
  if (mixedCase && checksummed !== address) {
    throw new TypeError(`Bad address checksum: ${address}`)
  }
  return checksummed
}

/**
 * The short form: the first four and last four hex digits after the prefix,
 * checksummed, `0x2b0F…6ef5`. The recovery surfaces use it wherever the
 * reader neither copies nor compares the address.
 */
export const renderShortAddress = (address: Address): string => {
  const full = checksumAddress(address)
  return `${full.slice(0, 6)}${ELLIPSIS}${full.slice(-4)}`
}

/**
 * The full form: the address whole, checksummed, with no grouping of its
 * digits. The recovery surfaces use it on every review or confirmation block, on
 * the cancel banner, on the guardian row's new key, on the approval page's
 * fields, on the key to fund, on the Recovery Card and wherever the reader
 * copies or compares the address: a truncated key is what an attacker grinding a
 * look-alike address imitates.
 */
export const renderFullAddress = (address: Address): string => checksumAddress(address)

// ---------------------------------------------------------------------------
// Hashes and approvals
// ---------------------------------------------------------------------------

const truncateHex = (value: Hex, lead: number, tail: number): string => {
  if (!isHex(value)) {
    throw new TypeError(`Not hex: ${value}`)
  }
  const digits = value.slice(2)
  if (digits.length <= lead + tail) return value
  return `0x${digits.slice(0, lead)}${ELLIPSIS}${digits.slice(-tail)}`
}

/** Leading and trailing digits of a transaction hash or a challenge. */
export const HASH_DIGITS = { lead: 12, tail: 6 } as const

/** Leading and trailing digits of an approval blob. */
export const APPROVAL_DIGITS = { lead: 12, tail: 8 } as const

/**
 * A transaction hash or a challenge as twelve leading and six trailing digits,
 * `0x8f31a27b04ce…5d19c2`. A value that short or shorter renders whole.
 */
export const renderHash = (hash: Hex): string =>
  truncateHex(hash, HASH_DIGITS.lead, HASH_DIGITS.tail)

/**
 * An approval blob as twelve leading and eight trailing digits,
 * `0x8ba2c71f04e9…5fa37ad3`. A value that short or shorter renders whole.
 */
export const renderApproval = (approval: Hex): string =>
  truncateHex(approval, APPROVAL_DIGITS.lead, APPROVAL_DIGITS.tail)

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

/** The most characters a name or a user-typed method name renders with. */
export const NAME_MAX_LENGTH = 24

// The user-perceived characters of `text`. Intl.Segmenter is created here, at
// call time, and never at module load: the gecko manifest's strict_min_version
// is 115 and Firefox ships Intl.Segmenter only from 125, so on Firefox 115 to
// 124 a load-time `new Intl.Segmenter` would throw on import and break every
// recovery screen. Where Intl.Segmenter is absent, the split falls back to
// code points, which keeps a surrogate pair whole but can split a flag or a
// joined emoji.
const splitCharacters = (text: string): string[] => {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(segmenter.segment(text), ({ segment }) => segment)
  }
  return Array.from(text)
}

/**
 * A resolved name or a user-typed method name, whole up to 24 characters and
 * capped at 24 past that, the last one the ellipsis. Counts grapheme
 * clusters (user-perceived characters), so an emoji, a flag or a letter with
 * its combining marks is never split; on a browser without Intl.Segmenter
 * (Firefox before 125) it counts code points instead.
 */
export const ellipsizeName = (name: string): string => {
  const chars = splitCharacters(name)
  if (chars.length <= NAME_MAX_LENGTH) return name
  return `${chars.slice(0, NAME_MAX_LENGTH - 1).join('')}${ELLIPSIS}`
}

/**
 * Where a resolved name renders, which decides whether it carries the caveat:
 * - `besideAddressToCheck`: beside a full address the reader is asked to check;
 * - `aloneForAction`: alone, for an address the reader is asked to act on;
 * - `informationOnly`: where the screen asks the reader to check nothing.
 */
export const NAME_USES = ['besideAddressToCheck', 'aloneForAction', 'informationOnly'] as const

/** Tells whether a resolved name in this use carries the caveat. */
export const nameNeedsCaveat = (use: NameUse): boolean => use !== 'informationOnly'

/**
 * A resolved name with its caveat: the name can change hands and the
 * full address is what to check. The caveat renders beside a name standing
 * beside a full address to check and beside a name alone for an address to
 * act on; an account line that asks the reader to check nothing is exempt.
 *
 * An empty or blank name returns null, no name and no caveat, so the screen
 * falls back to the address.
 */
export const renderResolvedName = (
  name: string,
  use: NameUse,
  t: Translate = i18n.t
): RenderedName | null => {
  if (name.trim() === '') return null
  return {
    name: ellipsizeName(name),
    caveat: nameNeedsCaveat(use) ? t('socialRecovery.display.nameCaveat') : null
  }
}

// ---------------------------------------------------------------------------
// Hidden value
// ---------------------------------------------------------------------------

/**
 * A hidden value as sixteen dots beside a hidden chip, so a masked value never
 * looks like a load failure.
 */
export const renderHiddenValue = (t: Translate = i18n.t): RenderedHiddenValue => ({
  dots: t('socialRecovery.display.hiddenValue'),
  chip: t('socialRecovery.display.hiddenChip')
})

// ---------------------------------------------------------------------------
// Member list
// ---------------------------------------------------------------------------

/** How many members a list shows before the count of the rest. */
export const MEMBER_LIST_VISIBLE = 3

/**
 * A member list as three members then a count of the rest. The recovery
 * checklist shows every member and passes `showAll`.
 */
export const renderMemberList = <T>(
  members: readonly T[],
  options: { showAll?: boolean } = {},
  t: Translate = i18n.t
): RenderedMemberList<T> => {
  if (options.showAll || members.length <= MEMBER_LIST_VISIBLE) {
    return { shown: members, restCount: 0, more: null }
  }
  const restCount = members.length - MEMBER_LIST_VISIBLE
  return {
    shown: members.slice(0, MEMBER_LIST_VISIBLE),
    restCount,
    more: t('socialRecovery.display.moreMembers', { count: restCount })
  }
}

// ---------------------------------------------------------------------------
// Payment order
// ---------------------------------------------------------------------------

/**
 * A token amount in human units, with at least two decimals and no trailing
 * zero past them: `12500000` at six decimals reads `12.50`. Throws a TypeError
 * on a negative amount, which no token transfer carries. Throws a TypeError on
 * decimals that are negative, not an integer or above 255, which no token
 * metadata carries.
 */
export const renderTokenAmount = (amount: bigint, decimals: number): string => {
  if (amount < 0n) {
    throw new TypeError(`Not a token amount: ${amount}`)
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new TypeError(`Not token decimals: ${decimals}`)
  }
  const [whole, fraction = ''] = formatUnits(amount, decimals).split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

/**
 * The payment order as the token's symbol, a human amount and the payee beside
 * it, one form on every screen: `12.50 USDC to 0x…`, or `12.50 USDC to whoever
 * executes` where the payee is the zero address, which leaves it open. A missing
 * order or a zero amount renders the words no payment. The payee always renders
 * in the full form. The payee passes the address check before the zero test, so
 * a malformed zero address throws a TypeError instead of reading as open.
 *
 * The payment order belongs to a later release; a request of the first release
 * names no payment and renders no payment.
 */
export const renderPaymentOrder = (
  order: PaymentOrder | null | undefined,
  token: PaymentToken | null | undefined,
  t: Translate = i18n.t
): string => {
  if (!order || order.amount === 0n) {
    return renderValueLabel('noPayment', t)
  }
  if (!token) {
    throw new TypeError('A payment order renders only with its token symbol and decimals')
  }
  const amount = renderTokenAmount(order.amount, token.decimals)
  const payee = renderFullAddress(order.payee)
  if (payee === zeroAddress) {
    return t('socialRecovery.display.paymentOrderOpenPayee', { amount, symbol: token.symbol })
  }
  return t('socialRecovery.display.paymentOrder', { amount, symbol: token.symbol, payee })
}

// ---------------------------------------------------------------------------
// Deadline and countdown
// ---------------------------------------------------------------------------

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/** The locale the deadline's date and time render in, `13 Aug, 18:04 CEST`. */
export const DEADLINE_LOCALE = 'en-GB'

// The largest distance from the epoch, in milliseconds, that a Date can hold.
const MAX_TIME_MS = 8.64e15

// A time as epoch milliseconds. NaN, an infinity, an invalid Date or a time past
// what a Date can hold throws a TypeError here, so the date format never throws
// a RangeError on it and the time left never reads NaN.
const toMs = (value: Date | number): number => {
  const ms = typeof value === 'number' ? value : value.getTime()
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_TIME_MS) {
    throw new TypeError(`Not a time: ${String(value)}`)
  }
  return ms
}

// A time left in milliseconds. NaN or an infinity throws a TypeError here, so a
// countdown never reads NaN or falls to execution due on a bad value. A time
// left is a span, not a date, so the Date bound does not apply to it.
const checkRemainingMs = (remainingMs: number): number => {
  if (!Number.isFinite(remainingMs)) {
    throw new TypeError(`Not a time: ${String(remainingMs)}`)
  }
  return remainingMs
}

/** The date and time of `at` in `timeZone`, the zone named, and the zone alone. */
export const renderDateTimeInZone = (
  at: Date | number,
  timeZone: string,
  locale: string = DEADLINE_LOCALE
): { date: string; zone: string } => {
  const format = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
    timeZoneName: 'short'
  })
  const date = new Date(toMs(at))
  const zone = format.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? ''
  return { date: format.format(date), zone }
}

/**
 * The time left before a deadline in whole hours, or in whole minutes under one
 * hour, `23 hours`. Both round down; under one minute it reads one minute. A
 * time left that is not finite throws a TypeError.
 */
export const renderRemaining = (remainingMs: number, t: Translate = i18n.t): string => {
  checkRemainingMs(remainingMs)
  if (remainingMs >= HOUR_MS) {
    const count = Math.floor(remainingMs / HOUR_MS)
    return t('socialRecovery.display.remainingHours', { count })
  }
  const count = Math.max(1, Math.floor(remainingMs / MINUTE_MS))
  return t('socialRecovery.display.remainingMinutes', { count })
}

/**
 * The deadline as a date and time in the reader's zone, the zone named, with
 * the time left beside it: `Valid until 13 Aug, 18:04 CEST ·
 * 23 hours left`. `now` and the reader's zone are parameters, so the output
 * depends on nothing else. A deadline or a `now` that is not a valid time throws
 * a TypeError.
 */
export const renderDeadline = (
  input: { deadline: Date | number; now: Date | number; timeZone: string; locale?: string },
  t: Translate = i18n.t
): RenderedDeadline => {
  const { date, zone } = renderDateTimeInZone(input.deadline, input.timeZone, input.locale)
  const remainingMs = toMs(input.deadline) - toMs(input.now)
  if (remainingMs <= 0) {
    return { date, zone, remaining: null, passed: true, line: null }
  }
  const remaining = renderRemaining(remainingMs, t)
  return {
    date,
    zone,
    remaining,
    passed: false,
    line: t('socialRecovery.display.deadlineValidUntil', { date, remaining })
  }
}

/**
 * The time left of a waiting period as hours, minutes and seconds, `47:12:06`.
 * A time left that is not finite throws a TypeError.
 */
export const renderCountdownTime = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(checkRemainingMs(remainingMs) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** The two states of a running attempt's countdown. */
export const COUNTDOWN_STATES = ['waiting', 'executionDue'] as const

/**
 * The countdown state the time left gives: waiting while a whole second is
 * left, execution due once the waiting period has ended. It counts
 * whole seconds, like `renderCountdownTime`, so 500 ms left never renders
 * `00:00:00 · waiting`. A time left that is not finite throws a TypeError.
 */
export const countdownStateOf = (remainingMs: number): CountdownState =>
  Math.floor(checkRemainingMs(remainingMs) / 1000) > 0 ? 'waiting' : 'executionDue'

/**
 * A running attempt's countdown: `47:12:06 · waiting` while the waiting period
 * runs and `Execution due` once it ends. `stopped` marks a security stop on the
 * attempt, a state of a later release: `47:12:06 · stopped` and
 * `Execution due · stopped`.
 *
 * The rendered state derives from the time alone, through `countdownStateOf`:
 * the caller passes no state, so no input can pair a waiting state with a
 * period that has ended, or the reverse. Zero or less time left renders the
 * execution-due form.
 */
export const renderCountdown = (
  input: { remainingMs: number; stopped?: boolean },
  t: Translate = i18n.t
): string => {
  if (countdownStateOf(input.remainingMs) === 'executionDue') {
    return input.stopped
      ? t('socialRecovery.display.countdownExecutionDueStopped')
      : renderChip('attempt', 'executionDue', t)
  }
  const time = renderCountdownTime(input.remainingMs)
  return input.stopped
    ? t('socialRecovery.display.countdownStopped', { time })
    : t('socialRecovery.display.countdownWaiting', { time })
}
