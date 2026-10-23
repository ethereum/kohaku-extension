/**
 * The checklist: the live session of the account being recovered, one row
 * per place of the gathering under the path's clauses, the headline that
 * counts a group as one unit, the request's deadline, and continue once the
 * assessment finds the rule satisfied. Nothing renders before the stored
 * session is read and the account's recovery state has answered once; a
 * failed read never renders as an empty path, and a failed poll holds every
 * row until a poll succeeds.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import type { ApproverRequest } from '@kohaku-eth/social-recovery'
import { failed } from '@web/modules/social-recovery/shared/ceremony'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import { addressBookOf, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'

import AadhaarRow from './AadhaarRow'
import AbandonBlock from './AbandonBlock'
import ChecklistRows from './ChecklistRows'
import { IDENTITY_CLAIM_SLUGS, PASSKEY_SLUG } from './constants'
import DeadlineBlock from './DeadlineBlock'
import GuardianRow from './GuardianRow'
import IdentityRow from './IdentityRow'
import PasskeyRow from './PasskeyRow'
import PassportRow from './PassportRow'
import PollAlert from './PollAlert'
import { attemptLive, deadlinePassed } from './poll'
import {
  chosenPlacesOf,
  headlineOf,
  layoutOf,
  methodDidNotAnswer,
  rowStatesOf,
  servedIdentitiesOf,
  unlockLineKeyOf,
  unsatisfiedOf
} from './rows'
import { submitPathOf, waitPathOf } from './search'
import type {
  AddReply,
  AlertKeys,
  AnsweredMemory,
  ChecklistFailure,
  ChecklistRow,
  ChecklistViewProps,
  DeadRequest,
  IdentityClaimSlug,
  Navigate,
  SlotReading
} from './types'
import UnsatisfiedBlock from './UnsatisfiedBlock'
import useCeremonyClaim from './useCeremonyClaim'
import useChecklist from './useChecklist'
import useGuardianSupport from './useGuardianSupport'
import WipedBlock from './WipedBlock'

const CHECKLIST = 'socialRecovery.checklist'

const FAILURE_KEYS: Record<ChecklistFailure, AlertKeys> = {
  records: {
    title: 'socialRecovery.client.unavailableTitle',
    body: 'socialRecovery.client.unavailableBody'
  },
  setup: {
    title: 'socialRecovery.entry.confirm.setupReadFailedTitle',
    body: 'socialRecovery.entry.confirm.setupReadFailedBody'
  },
  open: {
    title: `${CHECKLIST}.openFailedTitle`,
    body: `${CHECKLIST}.openFailedBody`
  },
  destination: {
    title: 'socialRecovery.entry.confirm.readFailed',
    body: 'socialRecovery.client.unavailableBody'
  }
}

const ChecklistView = ({
  records,
  chainId,
  account,
  entry,
  client,
  destination,
  search,
  navigate,
  deps
}: ChecklistViewProps) => {
  const { t } = useTranslation()
  const book = useMemo(() => addressBookOf(WALLET_RECOVERY_CHAIN), [])
  const claim = useCeremonyClaim({ records, chainId, account, search, navigate, deps })
  // A landed request keeps no claim either: the tab leaves for the wait only
  // once the claims of the request that landed lose their requests and reports.
  const lastRequest = useRef<DeadRequest | null>(null)
  const { forgetAll } = claim
  const leave = useCallback<Navigate>(
    (to, options) => {
      if (to === waitPathOf(account) && lastRequest.current) {
        forgetAll(lastRequest.current)
      }
      navigate(to, options)
    },
    [account, forgetAll, navigate]
  )
  const checklist = useChecklist({
    records,
    chainId,
    account,
    entry,
    client,
    destination,
    navigate: leave,
    deps
  })
  const [answered, setAnswered] = useState<Partial<Record<number, AnsweredMemory>>>({})
  const [pendingFailed, setPendingFailed] = useState(false)

  const { load, assessment, addReply, poll } = checklist
  const kit = client.status === 'ready' ? client.client : null
  const live = load.phase === 'live' ? load : null
  useEffect(() => {
    if (live) {
      const { attemptId, setupNonce } = live.session.gathering.request
      lastRequest.current = { attemptId, setupNonce }
    }
  }, [live])
  const pollClock = poll.status === 'answered' ? poll.clock : null
  const served = useMemo(
    () => (kit ? servedIdentitiesOf(kit, IDENTITY_CLAIM_SLUGS) : new Set<IdentityClaimSlug>()),
    [kit]
  )

  const layout = useMemo(
    () => (live ? layoutOf(live.configuration, live.session.gathering, book) : null),
    [live, book]
  )
  const requests = useMemo(() => {
    if (!live || !kit) {
      return new Map<number, ApproverRequest>()
    }
    try {
      return new Map(
        kit.recovery
          .getApproverRequests(live.session.gathering)
          .map((request) => [request.place, request])
      )
    } catch {
      return new Map<number, ApproverRequest>()
    }
  }, [live, kit])
  // The places the submission would carry, from the client's own pick, so a
  // filled row it leaves out reads not needed.
  const chosen = useMemo(
    () =>
      live && kit && assessment && pollClock !== null
        ? chosenPlacesOf(kit, live.session.gathering, assessment, Math.floor(pollClock / 1000))
        : undefined,
    [live, kit, assessment, pollClock]
  )
  const { outcomes } = claim
  const didNotAnswer = useMemo(
    () =>
      new Set(
        Object.entries(outcomes)
          .filter(([, held]) => !!held && methodDidNotAnswer(held.outcome))
          .map(([place]) => Number(place))
      ),
    [outcomes]
  )
  const states = useMemo(
    () =>
      layout && assessment
        ? rowStatesOf(layout, assessment, live?.session.notes, claim.asked, {
            chosen,
            didNotAnswer,
            served
          })
        : null,
    [layout, assessment, live, claim.asked, chosen, didNotAnswer, served]
  )
  const guardianSupport = useGuardianSupport({
    kit,
    gathering: live ? live.session.gathering : null,
    requests,
    layout,
    destination,
    now: deps.now,
    timeZone: deps.timeZone
  })

  // A passed claim joins the session once it is live; a conflict keeps it
  // waiting for the reload, and a refusal reads as the row's note. A claim
  // whose reply the session already holds, as after a reload between the
  // write and the settle, settles with nothing added and nothing refused.
  const { pending, settle } = claim
  const applying = useRef(false)
  const applyPending = useCallback(async () => {
    if (!pending || applying.current) {
      return
    }
    if (assessment?.filled.includes(pending.place)) {
      settle(pending.place)
      return
    }
    applying.current = true
    setPendingFailed(false)
    try {
      const result = await addReply(pending.reply)
      if (result.kind === 'added') {
        setAnswered((held) => ({
          ...held,
          [pending.place]: { phone: pending.facts?.place === 'phone', at: deps.now() }
        }))
        settle(pending.place)
      } else if (result.kind === 'refused') {
        settle(pending.place, failed('check-rejected', result.cause))
      } else if (result.kind === 'write-failed') {
        setPendingFailed(true)
      }
    } finally {
      applying.current = false
    }
  }, [pending, assessment, addReply, settle, deps])
  const isLive = load.phase === 'live'
  // The view's own clock, read when the deadline line reports the pass. Past
  // the request's deadline the chain read that lands or wipes it still runs.
  const { retryPoll } = checklist
  const { now } = deps
  const [passedAt, setPassedAt] = useState<number | null>(null)
  const onDeadlinePassed = useCallback(() => {
    setPassedAt(now())
    retryPoll()
  }, [now, retryPoll])
  const pastDeadline =
    !!live && passedAt !== null && deadlinePassed(live.session.gathering, passedAt)
  // A failed poll, a death being written, or one the records could not wipe,
  // holds every add, launch and continue until a poll succeeds; a request past
  // its deadline holds them for good.
  const held = poll.status === 'failed' || checklist.deathFailed || checklist.dying || pastDeadline
  // A paste whose check was in flight when the hold began is refused at its
  // add, read at that moment, so it never writes while the rows may be stale.
  const heldRef = useRef(held)
  heldRef.current = held
  const addHeldReply = useCallback<AddReply>(
    async (reply) => (heldRef.current ? { kind: 'held' } : addReply(reply)),
    [addReply]
  )
  const addable = isLive && poll.status === 'answered' && !held
  useEffect(() => {
    if (addable && pending && !pendingFailed && !checklist.busy) {
      applyPending().catch(() => setPendingFailed(true))
    }
  }, [addable, pending, pendingFailed, checklist.busy, applyPending])

  // A wiped session keeps no claim and no outcome: every request and report
  // of the request that died goes, a report that lands later included.
  const died = load.phase === 'wiped' ? load.died : undefined
  const isWiped = load.phase === 'wiped'
  const ceremonyId = search.ceremony
  useEffect(() => {
    if (isWiped) {
      forgetAll(died)
    }
  }, [isWiped, died, pending, ceremonyId, outcomes, forgetAll])

  const titleOf = (satisfied: boolean) => (
    <PageTitle
      title={t(satisfied ? `${CHECKLIST}.satisfiedTitle` : `${CHECKLIST}.title`)}
      lead={t(satisfied ? `${CHECKLIST}.satisfiedLead` : `${CHECKLIST}.lead`)}
      titleTestID="checklist-title"
    />
  )
  const title = titleOf(false)

  const retryButton = (onPress: () => void, testID: string, disabled = false) => (
    <View style={spacings.mtTy}>
      <Button
        testID={testID}
        type="secondary"
        size="small"
        text={t('socialRecovery.writes.tryAgain')}
        onPress={onPress}
        disabled={disabled}
        hasBottomSpacing={false}
        style={flexbox.alignSelfStart}
      />
    </View>
  )

  const errorAlert = (keys: AlertKeys, testID: string, onRetry: () => void) => (
    <Alert
      testID={testID}
      type="error"
      size="sm"
      style={spacings.mbSm}
      title={t(keys.title)}
      text={t(keys.body)}
    >
      {retryButton(onRetry, `${testID}-retry`)}
    </Alert>
  )

  if (client.status === 'update-the-wallet' || client.status === 'failed') {
    const refused = client.status === 'update-the-wallet'
    return (
      <TwoColumn testID="checklist-columns">
        <View testID="checklist">
          {title}
          {errorAlert(
            refused
              ? {
                  title: 'socialRecovery.client.updateTheWalletTitle',
                  body: 'socialRecovery.client.updateTheWalletBody'
                }
              : {
                  title: 'socialRecovery.client.unavailableTitle',
                  body: 'socialRecovery.client.unavailableBody'
                },
            `checklist-client-${client.status}`,
            checklist.retry
          )}
        </View>
      </TwoColumn>
    )
  }

  if (load.phase === 'failed') {
    return (
      <TwoColumn testID="checklist-columns">
        <View testID="checklist">
          {title}
          {errorAlert(FAILURE_KEYS[load.cause], `checklist-failed-${load.cause}`, checklist.retry)}
        </View>
      </TwoColumn>
    )
  }

  if (load.phase === 'conflict') {
    return (
      <TwoColumn testID="checklist-columns">
        <View testID="checklist">
          {title}
          {errorAlert(
            {
              title: `${CHECKLIST}.conflictTitle`,
              body: `${CHECKLIST}.conflictBody`
            },
            'checklist-conflict',
            checklist.retry
          )}
        </View>
      </TwoColumn>
    )
  }

  if (load.phase === 'wiped') {
    let slot: SlotReading = 'unread'
    if (poll.status === 'failed') {
      slot = 'failed'
    } else if (poll.status === 'answered') {
      slot = attemptLive(poll.facts.attempt) ? 'held' : 'free'
    }
    return (
      <TwoColumn testID="checklist-columns">
        <WipedBlock
          session={load.session}
          timeZone={deps.timeZone}
          busy={checklist.busy || destination.status !== 'ready'}
          failed={checklist.gatherFailed}
          onGatherAgain={() => {
            checklist.gatherAgain().catch(() => undefined)
          }}
          hadReplies={load.hadReplies}
          slot={slot}
          onRetryPoll={checklist.retryPoll}
          onReadSetupAgain={() => {
            checklist.readSetupAgain().catch(() => undefined)
          }}
        />
      </TwoColumn>
    )
  }

  // The rows never render before the account's recovery state answered once.
  if (!live || poll.status === 'pending') {
    return (
      <TwoColumn testID="checklist-columns">
        <View testID="checklist">
          {title}
          <ActivityIndicator testID="checklist-loading" />
        </View>
      </TwoColumn>
    )
  }

  if (!layout || !assessment || !states) {
    return (
      <TwoColumn testID="checklist-columns">
        <View testID="checklist">
          {title}
          {errorAlert(FAILURE_KEYS.setup, 'checklist-failed-setup', checklist.retry)}
        </View>
      </TwoColumn>
    )
  }

  const headline = headlineOf(layout, assessment)
  const dormant = poll.status === 'answered' && !poll.facts.authorized
  const busy = checklist.busy || claim.busy || held
  const satisfied = assessment.ruleSatisfied
  const everyRowComplete = [...states.values()].every((state) => state.chip === 'complete')
  const unsatisfied = unsatisfiedOf(layout, assessment, states, served)

  const renderRow = (row: ChecklistRow) => {
    const state = states.get(row.place)
    if (!state) {
      return null
    }
    const request = requests.get(row.place)
    if (row.kind === 'passkey') {
      return (
        <PasskeyRow
          row={row}
          state={state}
          request={request}
          outcome={claim.outcomes[row.place]}
          answered={answered[row.place]}
          rpIdHash={deps.rpIdHash}
          served={deps.passkeysServed}
          busy={busy}
          timeZone={deps.timeZone}
          route={entry.route}
          launch={(asked, handOff) => {
            claim
              .launch(asked, { method: PASSKEY_SLUG, params: { handOff }, handOff })
              .catch(() => undefined)
          }}
        />
      )
    }
    if ((row.kind === 'zkpassport' || row.kind === 'aadhaar') && kit && served.has(row.kind)) {
      const slug = row.kind
      const IdentityClaimRow = slug === 'zkpassport' ? PassportRow : AadhaarRow
      return (
        <IdentityClaimRow
          row={row}
          state={state}
          request={request}
          outcome={claim.outcomes[row.place]}
          busy={busy}
          launch={(asked) => {
            const params = kit.methodParamsFor(slug, 'createClaim')
            if (params) {
              claim.launch(asked, { method: slug, params, handOff: false }).catch(() => undefined)
            }
          }}
        />
      )
    }
    if (row.kind === 'ecdsa') {
      return (
        <GuardianRow
          row={row}
          state={state}
          request={request}
          support={guardianSupport}
          busy={busy}
          setNote={(place, note) => {
            checklist.setNote(place, note).catch(() => undefined)
          }}
          addReply={addHeldReply}
        />
      )
    }
    return <IdentityRow row={row} state={state} />
  }

  const aside = (
    <>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${CHECKLIST}.verifyNoteTitle`)}
        testID="checklist-verify"
      >
        <Text fontSize={12} appearance="secondaryText">
          {t(`${CHECKLIST}.verifyNote`)}
        </Text>
      </SectionCard>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${CHECKLIST}.leavingKeepsTitle`)}
        testID="checklist-leaving-keeps"
      >
        <Text fontSize={12} appearance="secondaryText">
          {t(`${CHECKLIST}.leavingKeeps`)}
        </Text>
      </SectionCard>
    </>
  )

  return (
    <TwoColumn testID="checklist-columns" aside={aside}>
      <View testID="checklist">
        {titleOf(satisfied)}
        <Text fontSize={16} weight="semiBold" style={spacings.mbTy} testID="checklist-progress">
          {t(`${CHECKLIST}.progress`, { done: headline.done, total: headline.total })}
        </Text>
        <DeadlineBlock
          gathering={live.session.gathering}
          layout={layout}
          now={deps.now}
          timeZone={deps.timeZone}
          onPassed={onDeadlinePassed}
        />
        {poll.status === 'failed' && <PollAlert withRows onRetry={checklist.retryPoll} />}
        {checklist.deathFailed && (
          <Alert
            testID="checklist-death-failed"
            type="error"
            size="sm"
            style={spacings.mbSm}
            text={t(`${CHECKLIST}.deaths.wipeFailed`)}
          >
            {retryButton(checklist.retryPoll, 'checklist-death-failed-retry')}
          </Alert>
        )}
        {dormant && (
          <Alert
            testID="checklist-dormant"
            type="warning"
            size="sm"
            style={spacings.mbSm}
            title={t(`${CHECKLIST}.dormant.title`)}
            text={t(`${CHECKLIST}.dormant.body`)}
          />
        )}
        {!!unsatisfied && <UnsatisfiedBlock reading={unsatisfied} />}
        {claim.undelivered && (
          <Alert
            testID="checklist-undelivered"
            type="error"
            size="sm"
            style={spacings.mbSm}
            text={t('socialRecovery.ceremony.undeliveredNote')}
          >
            {retryButton(
              () => {
                claim.retryUndelivered().catch(() => undefined)
              },
              'checklist-undelivered-retry',
              busy
            )}
          </Alert>
        )}
        {(claim.launchFailed || checklist.noteFailed || pendingFailed) && (
          <Alert
            testID="checklist-write-failed"
            type="error"
            size="sm"
            style={spacings.mbSm}
            text={t(`${CHECKLIST}.writeFailed`)}
          >
            {pendingFailed &&
              retryButton(() => setPendingFailed(false), 'checklist-write-failed-retry')}
          </Alert>
        )}
        <ChecklistRows layout={layout} assessment={assessment} renderRow={renderRow} />
        {satisfied && !everyRowComplete && (
          <Text fontSize={14} style={spacings.mtSm} testID="checklist-satisfied">
            {t(`${CHECKLIST}.satisfied`)}
          </Text>
        )}
        <ActionsRow
          primary={
            <Button
              testID="checklist-continue"
              type="primary"
              text={t('socialRecovery.actions.continue')}
              disabled={!satisfied || busy || dormant}
              onPress={() => navigate(submitPathOf(account))}
              hasBottomSpacing={false}
            />
          }
          note={satisfied ? undefined : t(unlockLineKeyOf(layout))}
          noteTestID="checklist-unlock"
        />
        {unsatisfied?.kind !== 'didNotAnswer' && (
          <AbandonBlock
            busy={checklist.busy || claim.busy || checklist.dying}
            failed={checklist.abandonFailed}
            onAbandon={() => {
              checklist.abandon(claim.forgetAll).catch(() => undefined)
            }}
          />
        )}
      </View>
    </TwoColumn>
  )
}

export default React.memo(ChecklistView)
