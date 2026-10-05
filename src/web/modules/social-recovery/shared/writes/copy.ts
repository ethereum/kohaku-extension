/**
 * The copy of the shared write states and the deposit step: which keys of the
 * `socialRecovery.writes` block of en.json each state and each variant of the
 * step reads, in what order. The two components only lay out what these pure
 * renderers answer, so every rule stays here and in the machine.
 *
 * Every string comes from en.json through `t`, which defaults to the app's
 * i18next instance. The step links to nothing and promises nowhere that one
 * funding covers both the submission and the execution.
 */
import { etherUnits } from 'viem'

import i18n from '@common/config/localization'
import type { KitErrorName } from '@web/modules/social-recovery/sdk-interfaces'
import {
  renderChip,
  renderFullAddress,
  renderTokenAmount,
  Translate
} from '@web/modules/social-recovery/shared/display'

import { leavesAttemptReady } from './classify'
import { roundDownForDisplay, roundUpForDisplay } from './gas'
import { isOwnerWrite } from './kinds'
import { canRetry, offersMoveFunds } from './states'
import type {
  AttemptEnd,
  DepositStep,
  DepositStepRenderOptions,
  OwnerWrite,
  RenderedDepositStep,
  RenderedRoute,
  RenderedWriteState,
  RevertCause,
  WriteKind,
  WriteState
} from './types'

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const WRITES = 'socialRecovery.writes'
const GAS = `${WRITES}.gas`

/** The keys of `socialRecovery.writes` the write states read. */
export const WRITES_KEYS = {
  submitting: `${WRITES}.submitting`,
  submittingRecovery: `${WRITES}.submittingRecovery`,
  submittingBody: `${WRITES}.submittingBody`,
  notSent: `${WRITES}.notSent`,
  /**
   * A transaction another one from the same key replaced before it was mined
   * (ethers' `TRANSACTION_REPLACED`, `cancelled` or `replaced`): it reached no
   * revert and spent no gas of its own, and its call never ran.
   */
  replaced: `${WRITES}.replaced`,
  reverted: `${WRITES}.reverted`,
  revertedSave: `${WRITES}.revertedSave`,
  revertedSubmit: `${WRITES}.revertedSubmit`,
  revertedExecute: `${WRITES}.revertedExecute`,
  revertedEdit: `${WRITES}.revertedEdit`,
  revertedExecuteGone: `${WRITES}.revertedExecuteGone`,
  gasCheckFailed: `${WRITES}.gasCheckFailed`,
  tryAgain: `${WRITES}.tryAgain`,
  cancelRevertedTitle: `${WRITES}.cancelRevertedTitle`,
  cancelReverted: `${WRITES}.cancelReverted`,
  nowControlledBy: `${WRITES}.nowControlledBy`
} as const

/** The keys of `socialRecovery.writes.gas` the deposit step reads. */
export const GAS_KEYS = {
  fundTitle: `${GAS}.fundTitle`,
  sendingKey: `${GAS}.sendingKey`,
  sendingKeyPays: `${GAS}.sendingKeyPays`,
  submissionAmount: `${GAS}.submissionAmount`,
  secondFunding: `${GAS}.secondFunding`,
  network: `${GAS}.network`,
  balanceWaiting: `${GAS}.balanceWaiting`,
  continuesOnItsOwn: `${GAS}.continuesOnItsOwn`,
  alreadyFunded: `${GAS}.alreadyFunded`,
  continueUnlocks: `${GAS}.continueUnlocks`,
  notEnoughGas: `${GAS}.notEnoughGas`,
  notEnoughGasAccountKey: `${GAS}.notEnoughGasAccountKey`,
  notEnoughGasSendingKey: `${GAS}.notEnoughGasSendingKey`,
  shortfall: `${GAS}.shortfall`,
  shortfallSave: `${GAS}.shortfallSave`,
  shortfallSubmit: `${GAS}.shortfallSubmit`,
  shortfallCancel: `${GAS}.shortfallCancel`,
  transferRoute: `${GAS}.transferRoute`,
  transferRouteNote: `${GAS}.transferRouteNote`,
  outsideRoute: `${GAS}.outsideRoute`,
  /** An owner write's deposit from outside, where the step offers no transfer route. */
  outsideRouteAlone: `${GAS}.outsideRouteAlone`,
  transferIsAnOperation: `${GAS}.transferIsAnOperation`,
  copy: `${GAS}.copy`,
  /** The copy of the key's address failed: the holder selects it by hand. */
  copyFailed: `${GAS}.copyFailed`,
  /** The logged-in route's sending key, the key of the chosen account. */
  keyOf: `${GAS}.keyOf`,
  /** The logged-in route: the funds stay in the account and its key sends. */
  accountHoldsFunds: `${GAS}.accountHoldsFunds`,
  /** The fast track's amount line at execution due. */
  executionAmount: `${GAS}.executionAmount`,
  /** The blocker at execution due. */
  shortfallExecute: `${GAS}.shortfallExecute`,
  /** The network an owner write's key must be funded on. */
  networkOwner: `${GAS}.networkOwner`
} as const

/**
 * The reverted reading of each write: the save, the edit, the submission and
 * the execution each have their own sentence. Any other setup write reads the
 * generic `reverted`, and so does a cancel whose attempt is not gone. The
 * execution's entry is its "still ready" reading; `revertedKeyOf` picks
 * `revertedExecuteGone` for a cause that ends the attempt.
 */
export const REVERTED_KEYS: { readonly [W in WriteKind]: string } = {
  save: WRITES_KEYS.revertedSave,
  edit: WRITES_KEYS.revertedEdit,
  ownerWrite: WRITES_KEYS.reverted,
  cancel: WRITES_KEYS.reverted,
  submission: WRITES_KEYS.revertedSubmit,
  execution: WRITES_KEYS.revertedExecute
}

/**
 * The reverted sentence of a write for its cause. An execution reads that the
 * recovery is still ready only for a cause that leaves the attempt ready
 * (`leavesAttemptReady`: the wait has not ended, a security stop holds, or a
 * cause the wallet cannot name), and `revertedExecuteGone` otherwise, a cause
 * that ends the attempt, which offers no retry.
 */
export const revertedKeyOf = (write: WriteKind, cause: RevertCause): string =>
  write === 'execution' && !leavesAttemptReady(cause)
    ? WRITES_KEYS.revertedExecuteGone
    : REVERTED_KEYS[write]

/** The key of the cause sentence of one kit error, `socialRecovery.writes.causes.<name>`. */
export const causeKey = (name: KitErrorName): string => `${WRITES}.causes.${name}`

/** The key of the cause sentence of a revert the wallet cannot name. */
export const UNNAMED_CAUSE_KEY = `${WRITES}.causes.unnamed`

/** The key of the sentence naming the road that had already ended the attempt a cancel meant to end. */
export const cancelGoneRoadKey = (road: Exclude<AttemptEnd, 'executed'>): string =>
  `${WRITES}.cancelGoneRoad.${road}`

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/** An amount the holder sends, rounded up to the step's precision, with the native symbol. */
export const renderGasAmount = (wei: bigint, symbol: string): string =>
  `${renderTokenAmount(roundUpForDisplay(wei), etherUnits.wei)} ${symbol}`

/** A balance the key holds, rounded down to the step's precision, with the native symbol. */
export const renderGasBalance = (wei: bigint, symbol: string): string =>
  `${renderTokenAmount(roundDownForDisplay(wei), etherUnits.wei)} ${symbol}`

// ---------------------------------------------------------------------------
// The shared states
// ---------------------------------------------------------------------------

/** The sentence naming the cause of a revert, for the `{{cause}}` of the reverted reading. */
export const renderRevertCause = (cause: RevertCause, t: Translate = i18n.t): string =>
  cause.kind === 'named' ? t(causeKey(cause.name)) : t(UNNAMED_CAUSE_KEY)

const renderAttemptGone = (
  cause: Extract<RevertCause, { kind: 'attemptGone' }>,
  t: Translate
): Pick<RenderedWriteState, 'title' | 'lines' | 'controller'> => {
  const lines = [t(WRITES_KEYS.cancelReverted)]
  if (cause.ended && cause.ended !== 'executed') {
    lines.push(t(cancelGoneRoadKey(cause.ended)))
  }
  const controller =
    cause.ended === 'executed' && cause.controller
      ? { label: t(WRITES_KEYS.nowControlledBy), address: renderFullAddress(cause.controller) }
      : undefined
  return {
    title: t(WRITES_KEYS.cancelRevertedTitle),
    lines,
    ...(controller ? { controller } : {})
  }
}

/**
 * The copy of a write's state. The submitting state reads the in-progress chip,
 * its title and that the key is sending one transaction; the failed state reads
 * one of its two readings, the reverted one in the write's own words
 * (`revertedKeyOf`), or, for a cancel whose attempt was already gone, the gone
 * attempt's reading; a gas check that could not read says so with the retry. The
 * retry renders only where a retry can fix the state (`canRetry`). The other
 * states carry no copy here.
 */
export const renderWriteState = (state: WriteState, t: Translate = i18n.t): RenderedWriteState => {
  const base = { status: state.status, offersMoveFunds: offersMoveFunds(state) }
  const retry = canRetry(state) ? { retry: t(WRITES_KEYS.tryAgain) } : {}
  switch (state.status) {
    case 'submitting':
      return {
        ...base,
        chip: renderChip('method', 'inProgress', t),
        title: t(
          state.write === 'submission' ? WRITES_KEYS.submittingRecovery : WRITES_KEYS.submitting
        ),
        lines: [t(WRITES_KEYS.submittingBody)]
      }
    case 'gasReadError':
      return { ...base, ...retry, lines: [t(WRITES_KEYS.gasCheckFailed)] }
    case 'failedNotSent':
      // A replaced transaction was sent: it never ran, but it did not fail to reach the chain.
      return {
        ...base,
        ...retry,
        lines: [t(state.replaced ? WRITES_KEYS.replaced : WRITES_KEYS.notSent)]
      }
    case 'failedReverted':
      if (state.cause.kind === 'attemptGone') {
        return { ...base, ...retry, ...renderAttemptGone(state.cause, t) }
      }
      return {
        ...base,
        ...retry,
        lines: [
          t(revertedKeyOf(state.write, state.cause), {
            cause: renderRevertCause(state.cause, t)
          })
        ]
      }
    default:
      return { ...base, lines: [] }
  }
}

// ---------------------------------------------------------------------------
// The deposit step
// ---------------------------------------------------------------------------

/** The shortfall sentence of each owner write: the save's, the cancel's, and any other's. */
export const OWNER_SHORTFALL_KEYS: { readonly [W in OwnerWrite]: string } = {
  save: GAS_KEYS.shortfallSave,
  edit: GAS_KEYS.shortfall,
  ownerWrite: GAS_KEYS.shortfall,
  cancel: GAS_KEYS.shortfallCancel
}

/**
 * The copy of the deposit step, by variant:
 *
 * - An owner write (a save, another setup write, the owner's cancel) reads:
 *   not enough gas on the account's key, the shortfall, the key's address,
 *   both routes, that the transfer is itself an operation that key must send
 *   and pay for, and the network.
 * - A recovery call on the fast track reads: the key that sends the recovery
 *   pays its gas and the account cannot pay for itself until it is recovered;
 *   the key's address; the amount to send from outside; the network; and the
 *   lines of a step that waits for the funds.
 * - A recovery call on the logged-in route reads: the key of the chosen
 *   account, both routes and the transfer sentence, then the network and the
 *   waiting lines.
 *
 * The step before the submission alone adds that the execution is a second
 * funding asked for again at execution due, at that day's fee; the
 * step at execution due is that second funding. Each route shows its own
 * amount: the transfer's carries the transfer's own fee, the deposit from
 * outside the shortfall alone.
 *
 * `balance` is the key's latest balance for the waiting line, the step's own
 * by default.
 */
export const renderDepositStep = (
  step: DepositStep,
  options: DepositStepRenderOptions = {},
  t: Translate = i18n.t
): RenderedDepositStep => {
  const { symbol } = step.network
  const amount = renderGasAmount(step.shortfall, symbol)
  const network = step.network.name
  const keyAddress = renderFullAddress(step.key)
  const copyLabel = t(GAS_KEYS.copy)
  const copyFailed = t(GAS_KEYS.copyFailed)
  const transfer = step.routes.find((route) => route.kind === 'transfer')

  const routes: RenderedRoute[] = step.routes.map((route) => {
    const routeAmount = renderGasAmount(route.amount, symbol)
    if (route.kind === 'transfer') {
      return {
        kind: 'transfer',
        line: t(GAS_KEYS.transferRoute, { amount: routeAmount, account: route.from.name }),
        note: t(GAS_KEYS.transferRouteNote)
      }
    }
    return {
      kind: 'outside',
      line: transfer
        ? t(GAS_KEYS.outsideRoute, { amount: routeAmount })
        : isOwnerWrite(step.write)
        ? t(GAS_KEYS.outsideRouteAlone, { amount: routeAmount })
        : t(step.write === 'execution' ? GAS_KEYS.executionAmount : GAS_KEYS.submissionAmount, {
            amount: routeAmount
          })
    }
  })
  const transferSentence = transfer ? [t(GAS_KEYS.transferIsAnOperation)] : []

  const { write } = step
  if (isOwnerWrite(write)) {
    const shortfall = t(OWNER_SHORTFALL_KEYS[write], { amount })
    const title = t(GAS_KEYS.notEnoughGasAccountKey)
    return {
      ...(write === 'save' ? { eyebrow: t(GAS_KEYS.notEnoughGas) } : {}),
      title,
      lead: [shortfall],
      keyAddress,
      copyLabel,
      copyFailed,
      routes,
      notes: [...transferSentence, t(GAS_KEYS.networkOwner, { network })],
      waiting: [],
      blocker: { title, line: shortfall }
    }
  }

  const balance = renderGasBalance(options.balance ?? step.balance, symbol)
  return {
    title: t(GAS_KEYS.fundTitle),
    lead: [t(step.fastTrack ? GAS_KEYS.sendingKeyPays : GAS_KEYS.accountHoldsFunds)],
    keyLabel:
      step.fastTrack || !step.operates
        ? t(GAS_KEYS.sendingKey)
        : t(GAS_KEYS.keyOf, { account: step.operates.name }),
    keyAddress,
    copyLabel,
    copyFailed,
    routes,
    notes: [
      ...transferSentence,
      ...(step.write === 'submission' ? [t(GAS_KEYS.secondFunding)] : []),
      t(GAS_KEYS.network, { network })
    ],
    waiting: [
      t(GAS_KEYS.balanceWaiting, { balance }),
      t(GAS_KEYS.continuesOnItsOwn),
      t(GAS_KEYS.alreadyFunded)
    ],
    actionHint: t(GAS_KEYS.continueUnlocks),
    blocker: {
      title: t(GAS_KEYS.notEnoughGasSendingKey),
      line: t(step.write === 'execution' ? GAS_KEYS.shortfallExecute : GAS_KEYS.shortfallSubmit)
    }
  }
}
