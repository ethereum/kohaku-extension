/**
 * What the recovery did and what it leaves to clean up, from the path this
 * device holds and the consume event: the rows the accepted set used, whether
 * the path holds an address row (every guardian of it is now discoverable), a
 * passkey the recovery did not use, an identity method, and one cleanup block
 * for each passkey of the path. Every passkey gets the synced passkey's
 * repair: this release does not tell a device-bound passkey apart.
 *
 * The used rows come from the places the attempt's opening event publishes;
 * where the events no longer name the opening, from the methods the attempt
 * record names, against the path. Where this device holds no path, the used
 * methods' kinds stand alone and only a used passkey gets a cleanup block.
 */
import { isAddressEqual } from 'viem'

import type { Address, Configuration } from '@web/modules/social-recovery/sdk-interfaces'
import { SLOT_KINDS } from '@web/modules/social-recovery/shared/records/types'
import type { SlotKind } from '@web/modules/social-recovery/shared/records/types'

import { IDENTITY_KINDS } from './constants'
import type { CleanupBlock, PathRow, RecoverySummary, RemovalExit, SummaryInput } from './types'

const kindOfMethod = (method: Address, methods: Record<SlotKind, Address>): SlotKind | undefined =>
  SLOT_KINDS.find((kind) => isAddressEqual(methods[kind], method))

const isIdentity = (kind: SlotKind | undefined): boolean =>
  IDENTITY_KINDS.some((identity) => identity === kind)

/** The path's credentials at their places, the flat position across the clauses. */
export const rowsOfPath = (
  configuration: Configuration,
  methods: Record<SlotKind, Address>
): PathRow[] =>
  configuration.clauses
    .flatMap((clause, clauseIndex) =>
      clause.credentials.map((credential) => ({ credential, clause: clauseIndex }))
    )
    .map(({ credential, clause }, place) => ({
      place,
      clause,
      credential,
      kind: kindOfMethod(credential.method, methods)
    }))

/**
 * What removing one row leaves: none (add a method first), one row (it
 * becomes the whole rule), or more.
 */
export const removalExitOf = (rows: PathRow[], place: number): RemovalExit => {
  const others = rows.filter((row) => row.place !== place)
  if (others.length === 0) {
    return { kind: 'addFirst' }
  }
  if (others.length === 1 && others[0]) {
    return { kind: 'leavesWholeRule', remaining: others[0] }
  }
  return { kind: 'none' }
}

export const summaryOf = ({ configuration, addressBook, event }: SummaryInput): RecoverySummary => {
  const { methods } = addressBook
  const usedMethodKinds = event.usedMethods
    .map((method) => kindOfMethod(method, methods))
    .filter((kind): kind is SlotKind => kind !== undefined)

  if (!configuration) {
    const usedKinds = Array.from(new Set(usedMethodKinds))
    return {
      rows: [],
      used: [],
      usedKinds,
      discoverable: usedKinds.includes('ecdsa'),
      unusedPasskey: false,
      identity: usedKinds.some(isIdentity),
      cleanup: usedKinds.includes('passkey') ? [{ place: -1, exit: { kind: 'none' } }] : []
    }
  }

  const rows = rowsOfPath(configuration, methods)
  const places = event.started?.usedPlaces.map(Number)
  const used = places
    ? rows.filter((row) => places.includes(row.place))
    : rows.filter((row) =>
        event.usedMethods.some((method) => isAddressEqual(method, row.credential.method))
      )
  const usedKinds = Array.from(
    new Set(used.map((row) => row.kind).filter((kind): kind is SlotKind => kind !== undefined))
  )
  const cleanup = rows
    .filter((row) => row.kind === 'passkey')
    .map((row): CleanupBlock => ({ place: row.place, exit: removalExitOf(rows, row.place) }))

  return {
    rows,
    used,
    usedKinds,
    discoverable: rows.some((row) => row.kind === 'ecdsa'),
    unusedPasskey: rows.some((row) => row.kind === 'passkey' && !used.includes(row)),
    identity: rows.some((row) => isIdentity(row.kind)),
    cleanup
  }
}
