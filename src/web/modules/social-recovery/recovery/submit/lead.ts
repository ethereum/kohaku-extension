/**
 * The confirmation's copy as pure functions over what the screen read: the
 * lines of the lead, the path block's rows and its line by the path's shape,
 * and the publication lines by the kinds of the set the submission carries.
 * Strings come from `t`.
 */
import type { Gathering } from '@web/modules/social-recovery/sdk-interfaces'
import { renderFullAddress, renderResolvedName } from '@web/modules/social-recovery/shared/display'
import type { RenderedName, Translate } from '@web/modules/social-recovery/shared/display'
import type { RecoveryRoute } from '@web/modules/social-recovery/shared/records'
import type { ChecklistLayout, ChecklistRow } from '@web/modules/social-recovery/recovery/checklist'
import { guardianAddressOf, kindNameOf } from '@web/modules/social-recovery/setup/review'

import type { PathRowView } from './types'

const SUBMIT = 'socialRecovery.submit'
const ITEMS = 'socialRecovery.disclosures.items'

/** Every row of the layout, the required rows first. */
const rowsOf = (layout: ChecklistLayout): ChecklistRow[] => [
  ...layout.required,
  ...layout.groups.flatMap((group) => group.rows)
]

/** The account line under the address: the name that keeps it where one resolves, with its caveat. */
export const accountNameOf = (
  name: string | undefined,
  t: Translate
): { line: string; caveat: string | null } => {
  const resolved: RenderedName | null = name
    ? renderResolvedName(name, 'besideAddressToCheck', t)
    : null
  if (!resolved) {
    return { line: t(`${SUBMIT}.keepsAddress`), caveat: null }
  }
  return {
    line: t(`${SUBMIT}.keepsAddressNamed`, { name: resolved.name }),
    caveat: resolved.caveat
  }
}

/** The new key's line by route: the key this wallet created, or the key of the receiving account. */
export const newKeyLineOf = (
  route: RecoveryRoute,
  receivingName: string | undefined,
  t: Translate
): string | null => {
  if (route === 'fresh-install') {
    return t(`${SUBMIT}.newKeyFastTrack`)
  }
  return receivingName ? t(`${SUBMIT}.newKeyLoggedIn`, { account: receivingName }) : null
}

/**
 * Whether the request names no payment: no order, or an order of zero, the
 * records carrying the amount as a decimal string. The first release names
 * none; an order with an amount is no request this screen can render, so the
 * start stays locked.
 */
export const namesNoPayment = (gathering: Gathering): boolean => {
  const { order } = gathering.request
  return !order || BigInt(order.amount) === 0n
}

/**
 * The path block's rows, each by its kind's name and its label (a guardian's
 * full address, a passkey's own label), and whether the submission carries it.
 */
export const pathRowsOf = (
  layout: ChecklistLayout,
  chosen: ReadonlySet<number>,
  t: Translate
): PathRowView[] =>
  rowsOf(layout).map((row) => {
    const guardian = row.kind === 'ecdsa' ? guardianAddressOf(row.gatheringPlace) : undefined
    const passkeyLabel =
      row.kind === 'passkey' ? row.gatheringPlace.label?.trim() || undefined : undefined
    let label: string | undefined = passkeyLabel
    if (guardian) {
      label = renderFullAddress(guardian)
    }
    return {
      row,
      title: row.kind ? kindNameOf(row.kind, t) : renderFullAddress(row.gatheringPlace.method),
      ...(label ? { label } : {}),
      carried: chosen.has(row.place)
    }
  })

/**
 * The path block's lines by the path's shape: the required rows answered (one,
 * or every one), each group's members answered against its members, and that
 * the rows outside the set were not needed where any is.
 */
export const pathLinesOf = (
  layout: ChecklistLayout,
  chosen: ReadonlySet<number>,
  t: Translate
): string[] => {
  const lines: string[] = []
  if (layout.required.length === 1) {
    lines.push(t(`${SUBMIT}.path.oneRequired`))
  }
  if (layout.required.length > 1) {
    lines.push(t(`${SUBMIT}.path.allRequired`))
  }
  layout.groups.forEach((group) => {
    lines.push(
      t(`${SUBMIT}.path.groupAnswered`, {
        answered: group.rows.filter((row) => chosen.has(row.place)).length,
        count: group.rows.length
      })
    )
  })
  if (rowsOf(layout).some((row) => !chosen.has(row.place))) {
    lines.push(t(`${SUBMIT}.path.othersNotNeeded`))
  }
  return lines
}

/** Items as one phrase: one alone, two as a pair, three as a triple, more with the last ones paired. */
const joinItems = (items: string[], t: Translate): string => {
  const [first, second, ...rest] = items
  if (second === undefined) {
    return first
  }
  if (rest.length === 0) {
    return t(`${ITEMS}.pair`, { first, second })
  }
  return t(`${ITEMS}.triple`, { first, second, third: joinItems(rest, t) })
}

/**
 * The publication lines: the whole setup in the clear; what the methods the
 * set uses publish, named by their kinds; a guardian outside the set published
 * as a hash; and a method reused across accounts visibly shared.
 */
export const publicationLinesOf = (
  layout: ChecklistLayout,
  chosen: ReadonlySet<number>,
  t: Translate
): string[] => {
  const rows = rowsOf(layout)
  const used = rows.filter((row) => chosen.has(row.place))
  const count = (kind: ChecklistRow['kind']) => used.filter((row) => row.kind === kind).length
  const passkeys = count('passkey')
  const guardians = count('ecdsa')
  const items: string[] = []
  if (passkeys > 0) {
    items.push(passkeys > 1 ? t(`${ITEMS}.passkeys`) : t(`${SUBMIT}.publication.items.passkey`))
  }
  if (count('zkpassport') > 0) {
    items.push(t(`${SUBMIT}.publication.items.passport`))
  }
  if (count('aadhaar') > 0) {
    items.push(t(`${SUBMIT}.publication.items.aadhaar`))
  }
  if (guardians > 0) {
    items.push(
      t(`${SUBMIT}.publication.items.${guardians > 1 ? 'guardianAddresses' : 'guardianAddress'}`)
    )
  }
  const lines = [t(`${SUBMIT}.publication.whole`)]
  if (items.length > 0) {
    const plural = items.length > 1 || passkeys > 1 || guardians > 1
    lines.push(
      t(`${SUBMIT}.publication.used`, { items: joinItems(items, t), count: plural ? 2 : 1 })
    )
  }
  if (rows.some((row) => row.kind === 'ecdsa' && !chosen.has(row.place))) {
    lines.push(t(`${SUBMIT}.publication.unusedGuardians`))
  }
  lines.push(t(`${SUBMIT}.publication.shared`))
  return lines
}

/** The name of a row in the line that says its approval did not verify: its label, else its kind's name. */
export const rowNameOf = (
  layout: ChecklistLayout,
  place: number,
  t: Translate
): string | undefined => {
  const view = pathRowsOf(layout, new Set(), t).find(({ row }) => row.place === place)
  if (!view) {
    return undefined
  }
  return view.label ?? view.title
}
