/**
 * The overview over given reads. The status line reads set up or not set up,
 * with path locked beside set up where this device cannot read the path, not
 * active for a setup the account no longer authorizes or an authorization
 * with no setup behind it, and recovery in progress while an attempt is
 * open. A dormant setup shows its warning with re-authorize and clear; while
 * an attempt is open the re-authorize control is absent with the wallet's
 * reason in its place, the dormant reading stands over the attempt, and the
 * clear carries the sentence that it ends the recovery in progress. The
 * mirror shows its one action. The path, the moved-keys notices, the notice
 * after an ended attempt, the recover-an-account entry and the Recovery Card
 * follow. A read that runs or failed shows its own state, never an answer.
 * A write another screen stored as in flight keeps the title, and the status
 * line where the facts are read, above its pointer, with no path or action.
 * Once a recovery moved control away from every key this wallet holds, the
 * overview reads that the account is no longer controlled from
 * this device, when control moved and to which key where the watcher read
 * them, and the path with no action; no banner, repair or edit is offered.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import CardEntry from './CardEntry'
import { OVERVIEW } from './constants'
import ControlMovedBlock from './ControlMovedBlock'
import ControlMovedTitle from './ControlMovedTitle'
import DormantBlock from './DormantBlock'
import EmptyBlock from './EmptyBlock'
import MirrorBlock from './MirrorBlock'
import NoticesBlock from './NoticesBlock'
import OverviewChips from './OverviewChips'
import OverviewTitle from './OverviewTitle'
import PathBlock from './PathBlock'
import { controlMovedNoticeOf, overviewKindOf } from './readings'
import RecoverEntry from './RecoverEntry'
import type { OverviewFacts, OverviewKind, OverviewViewProps } from './types'

const OverviewView = ({
  reads,
  account,
  context,
  networkName,
  timeZone,
  ending,
  methodNameOf,
  adminOf,
  banner,
  step,
  held,
  onOpen,
  onTransaction,
  navigate
}: OverviewViewProps) => {
  const { t } = useTranslation()
  const { facts, path } = reads

  if (held) {
    const known = facts.status === 'answered' ? facts.value : null
    return (
      <TwoColumn testID="overview-columns">
        <View testID="overview-held">
          <OverviewTitle />
          {!!known && (
            <OverviewChips
              kind={overviewKindOf(known.setup)}
              path={path}
              attemptOpen={known.attemptOpen}
            />
          )}
          {held}
        </View>
      </TwoColumn>
    )
  }

  if (step) {
    return (
      <TwoColumn testID="overview-columns">
        <View testID="overview">{step}</View>
      </TwoColumn>
    )
  }

  if (facts.status !== 'answered') {
    return (
      <TwoColumn testID="overview-columns">
        <View testID="overview">
          <OverviewTitle />
          {facts.status === 'pending' && (
            <View testID="overview-reading">
              <ActivityIndicator style={spacings.mbSm} />
              <Text fontSize={14} appearance="secondaryText">
                {t(`${OVERVIEW}.reads.loading`)}
              </Text>
            </View>
          )}
          {facts.status === 'failed' && (
            <ReadFailedBlock
              testID="overview-read-failed"
              title={t(`${OVERVIEW}.reads.failedTitle`)}
              body={t(`${OVERVIEW}.reads.failedBody`)}
              onRetry={reads.retry}
            />
          )}
          {facts.status === 'update-the-wallet' && (
            <Alert
              testID="overview-update-the-wallet"
              type="error"
              size="sm"
              style={spacings.mbSm}
              title={t('socialRecovery.client.updateTheWalletTitle')}
              text={t('socialRecovery.client.updateTheWalletHow')}
            />
          )}
          <RecoverEntry navigate={navigate} />
        </View>
      </TwoColumn>
    )
  }

  const { setup, attemptOpen, movedBy }: OverviewFacts = facts.value
  const kind: OverviewKind = overviewKindOf(setup, movedBy)
  const notice = movedBy !== undefined ? controlMovedNoticeOf(movedBy, ending) : null

  const leadKey = (): string => {
    if (attemptOpen) {
      return `${OVERVIEW}.lead.inProgress`
    }
    return setup.hasSetup ? `${OVERVIEW}.lead.setUp` : `${OVERVIEW}.lead.notSetUp`
  }

  return (
    <TwoColumn testID="overview-columns">
      <View testID={`overview-${kind}`}>
        {notice ? (
          <ControlMovedTitle notice={notice} timeZone={timeZone} onTransaction={onTransaction} />
        ) : (
          <OverviewTitle lead={t(leadKey())} />
        )}
        <OverviewChips kind={overviewKindOf(setup)} path={path} attemptOpen={attemptOpen} />
        {!!notice && <ControlMovedBlock notice={notice} account={account} />}
        {attemptOpen && !notice && <View testID="overview-banner">{banner}</View>}
        {kind === 'dormant' && <DormantBlock attemptOpen={attemptOpen} onOpen={onOpen} />}
        {kind === 'mirror' && <MirrorBlock onOpen={onOpen} />}
        {setup.hasSetup && (
          <NoticesBlock
            reads={reads}
            context={context}
            timeZone={timeZone}
            ending={ending}
            methodNameOf={methodNameOf}
            adminOf={adminOf}
            navigate={navigate}
            actionable={!notice}
          />
        )}
        {setup.hasSetup && (
          <PathBlock
            reads={reads}
            context={context}
            networkName={networkName}
            kind={kind}
            attemptOpen={attemptOpen}
            navigate={navigate}
          />
        )}
        {kind === 'not-set-up' && <EmptyBlock navigate={navigate} />}
        <RecoverEntry navigate={navigate} />
        {setup.hasSetup && <CardEntry navigate={navigate} />}
      </View>
    </TwoColumn>
  )
}

export default React.memo(OverviewView)
