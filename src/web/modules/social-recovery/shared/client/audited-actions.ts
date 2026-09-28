/**
 * The extension's own table of the kit's audited actions and their publishers.
 *
 * The wallet offers the kit's audited actions and nothing else, and names each
 * with its publisher from this table. A screen offers, names or judges an
 * action only through `auditedActionsOn` and `auditedActionOf`, and the
 * descriptors' `auditedActions` sets are read from it.
 *
 * The action addresses are placeholders to replace once deployed (addresses.ts).
 */
import { PLACEHOLDER_ADDRESSES, sameAddress } from './addresses'
import type { AuditedAction, Publisher, PublisherKey, RecoveryChain, UnknownAction } from './types'

/**
 * The publishers of the audited actions, as slugs. A slug is data, never
 * copy: a screen renders a publisher's name through its en.json key,
 * `publisherKeyOf`, and this folder ships no string.
 */
export const PUBLISHERS = ['ethereumFoundation'] as const

/** The table: one row per audited action per chain. */
export const AUDITED_ACTIONS = [
  {
    kind: 'audited',
    chain: 'sepolia',
    // Placeholder address, to replace once deployed.
    action: PLACEHOLDER_ADDRESSES.sepolia.action,
    publisher: 'ethereumFoundation'
  },
  {
    kind: 'audited',
    chain: 'mainnet',
    // Placeholder address, to replace once deployed.
    action: PLACEHOLDER_ADDRESSES.mainnet.action,
    publisher: 'ethereumFoundation'
  }
] as const

/**
 * The explicit answer for an address the table does not hold. A screen
 * names no publisher for it and offers it nowhere.
 */
export const UNKNOWN_ACTION = Object.freeze({ kind: 'unknown-action' } as const)

const rows = (): readonly AuditedAction[] => AUDITED_ACTIONS

/** The audited actions of one chain, the only list a screen offers. */
export const auditedActionsOn = (chain: RecoveryChain): AuditedAction[] =>
  rows()
    .filter((row) => row.chain === chain)
    .map((row) => ({ ...row }))

/**
 * The table's row for an action address, on the given chain where one is
 * named, or `UNKNOWN_ACTION` where the table holds no such row.
 */
export const auditedActionOf = (
  action: string | undefined,
  chain?: RecoveryChain
): AuditedAction | UnknownAction => {
  const row = rows().find(
    (r) => sameAddress(r.action, action) && (chain === undefined || r.chain === chain)
  )
  return row ? { ...row } : UNKNOWN_ACTION
}

/**
 * The en.json key of the publisher of an audited action (or of a publisher
 * slug). A screen renders the name with `t(publisherKeyOf(row))`.
 */
export const publisherKeyOf = (row: Pick<AuditedAction, 'publisher'> | Publisher): PublisherKey =>
  `socialRecovery.display.publishers.${typeof row === 'string' ? row : row.publisher}`

/** Whether an action is one the kit audited, on the given chain where one is named. */
export const isAuditedAction = (action: string | undefined, chain?: RecoveryChain): boolean =>
  auditedActionOf(action, chain).kind === 'audited'
