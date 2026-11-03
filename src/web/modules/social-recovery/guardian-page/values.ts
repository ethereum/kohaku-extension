/**
 * The four values the lead shows and the deadline the details show, from what
 * the orchestrator described of the request. Every address renders in full,
 * since the guardian compares the account and the new key on the call. A
 * value the page cannot read renders as such, and the lead is then not
 * rendered, so the sign action stays disabled. Pure.
 */
import { zeroAddress } from 'viem'

import type { Address, RequestDescription } from '@kohaku-eth/social-recovery'
import {
  renderDeadline,
  renderFullAddress,
  renderPaymentOrder,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import type { Translate } from '@web/modules/social-recovery/shared/display'

import type { ApprovalValueLine, ApprovalValues, DeadlineView } from './types'

/** An address in full, or null where it fails its checksum. */
export const fullAddressOf = (address: Address): string | null => {
  try {
    return renderFullAddress(address)
  } catch {
    return null
  }
}

/**
 * The payment line: the words no payment where the request carries no order
 * or an order of zero. An order with an amount needs its token's symbol and
 * decimals, which nothing here reads, so it renders as not readable rather
 * than as an amount the guardian cannot check. An open payee is the zero
 * address the order names it with.
 */
const paymentOf = (description: RequestDescription, t: Translate): string | null => {
  const { order } = description
  try {
    return renderPaymentOrder(
      order && {
        token: order.token,
        amount: order.amount,
        payee: order.payee === 'open' ? zeroAddress : order.payee
      },
      null,
      t
    )
  } catch {
    return null
  }
}

/** The lead's four values, in the order the guardian reads them. */
export const approvalValuesOf = (description: RequestDescription, t: Translate): ApprovalValues => {
  const handover = description.handover?.decoded ? description.handover : null
  const lines: ApprovalValueLine[] = [
    {
      name: 'accountBeingRecovered',
      label: renderValueLabel('accountBeingRecovered', t),
      value: fullAddressOf(description.account)
    },
    {
      name: 'newKey',
      label: renderValueLabel('newKey', t),
      value: handover ? fullAddressOf(handover.newAuthority) : null
    },
    {
      name: 'keyBeingRemoved',
      label: renderValueLabel('keyBeingRemoved', t),
      value: handover ? fullAddressOf(handover.removedAuthority) : null
    },
    { name: 'payment', label: renderValueLabel('payment', t), value: paymentOf(description, t) }
  ]
  return { lines, rendered: lines.every((line) => line.value !== null) }
}

/**
 * The deadline with its time left, or with the words that it ended; null
 * where the request's deadline is no time a date can name.
 */
export const deadlineViewOf = (
  validUntil: number,
  now: number,
  timeZone: string,
  t: Translate
): DeadlineView | null => {
  try {
    const rendered = renderDeadline({ deadline: validUntil * 1000, now, timeZone }, t)
    if (rendered.passed || rendered.remaining === null) {
      return {
        line: t('socialRecovery.guardianPage.details.ended', { date: rendered.date }),
        passed: true
      }
    }
    return {
      line: t('socialRecovery.guardianPage.details.validUntil', {
        date: rendered.date,
        remaining: rendered.remaining
      }),
      passed: false
    }
  } catch {
    return null
  }
}
