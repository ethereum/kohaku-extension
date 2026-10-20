/**
 * The review before the save: the failed read of the records or the stored
 * write with retry, no edit open, the records still loading, then what the
 * edit changes, the new path with its rule lines, what a recovery publishes,
 * the trust list of the rows the edit adds under its expander, the account
 * the save writes to, what holds the save, the line that saving cancels the
 * attempt in progress, and the save with the way back to the editor.
 */
import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import { renderFullAddress } from '@web/modules/social-recovery/shared/display'
import { sameCredential } from '@web/modules/social-recovery/shared/records'
import {
  accountReadsToRetry,
  publicationSentenceOf,
  ruleLinesOf,
  saveGateOf,
  untestedInPath
} from '@web/modules/social-recovery/setup/review'
import PathBlock from '@web/modules/social-recovery/setup/review/PathBlock'
import SaveBlocker from '@web/modules/social-recovery/setup/review/SaveBlocker'
import TrustList from '@web/modules/social-recovery/setup/review/TrustList'

import ChangesBlock from './ChangesBlock'
import { EDITOR, REVIEW } from './constants'
import DetailsExpander from './DetailsExpander'
import NotTestedBlock from './NotTestedBlock'
import { editedSetupRead, editGateOf, passwordMissingOf } from './readings'
import type { ReviewArrivalProps } from './types'

const ReviewArrival = ({
  held,
  load,
  onRetryLoad,
  rows,
  stale,
  added,
  trustRows,
  trust,
  accountReads,
  addressBook,
  client,
  account,
  password,
  newPassword,
  expanded,
  onToggleExpanded,
  attemptOpen,
  dormantRefused,
  facts,
  lookingUp,
  runReady,
  lookupFailed,
  onSave,
  onLookAgain,
  onEditor,
  onOverview,
  backToEditor
}: ReviewArrivalProps) => {
  const { t } = useTranslation()

  if (held.status === 'failed' || load.status === 'failed') {
    return (
      <ReadFailedBlock
        testID="manage-review-load-failed"
        title={t('socialRecovery.records.loadFailed')}
        onRetry={onRetryLoad}
      />
    )
  }
  if (load.status === 'none') {
    return (
      <View testID="manage-review-nothing">
        <Text fontSize={14} style={spacings.mbSm}>
          {t(`${EDITOR}.changes.none`)}
        </Text>
        <ActionsRow primary={backToEditor} />
      </View>
    )
  }
  if (load.status !== 'loaded' || held.status === 'pending') {
    return <ActivityIndicator testID="manage-review-loading" />
  }
  const { draft, enrollments, baseline } = load
  const { clauses } = draft
  const passwordMissing = passwordMissingOf(baseline, draft, password, newPassword)
  const setupState = editedSetupRead(accountReads.setupState)
  const gate = editGateOf({
    gate: saveGateOf({
      ...accountReads,
      setupState,
      recordsLoaded: true,
      clientReady: !!client,
      trustRows,
      untested: untestedInPath(clauses, enrollments).filter(({ credential }) =>
        added.some((one) => sameCredential(one, credential))
      ),
      clauses,
      backup: draft.privacy.backup,
      passwordSet: !passwordMissing
    }),
    rows,
    added,
    reads: { ...accountReads, setupState },
    clientReady: !!client
  })
  const retryUnanswered = () => {
    trustRows
      .filter(({ contract }) => contract.status === 'unavailable')
      .forEach(({ method }) => trust.retry(method))
    accountReads.retry(accountReadsToRetry(accountReads))
  }
  const publication = publicationSentenceOf(clauses, addressBook, t)
  const ruleLines = ruleLinesOf(draft, addressBook, t)

  return (
    <View testID="manage-review-arrival">
      <ChangesBlock rows={rows} stale={stale} />

      <SectionCard>
        <PathBlock
          clauses={clauses}
          enrollments={enrollments}
          addressBook={addressBook}
          onRetryTest={onEditor}
        />
        {ruleLines.map((ruleLine, index) => (
          <Text
            // The lines are rebuilt from the path on every render, so a line's place is its identity.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            fontSize={14}
            style={spacings.mbTy}
            testID={`manage-review-rule-line-${index}`}
          >
            {ruleLine}
          </Text>
        ))}
      </SectionCard>

      <SectionCard tone="muted" spacing="item" label={t('socialRecovery.review.publicationHeader')}>
        <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
          {t('socialRecovery.review.publication.lead')}
        </Text>
        {!!publication && (
          <Text fontSize={12} appearance="secondaryText" testID="manage-review-publication">
            {publication}
          </Text>
        )}
      </SectionCard>

      {trustRows.length > 0 && (
        <SectionCard label={t(`${REVIEW}.addedRows`)} testID="manage-review-added">
          <DetailsExpander
            testID="manage-review-verify-details"
            expanded={expanded}
            onToggle={onToggleExpanded}
          />
          {expanded && !!client && (
            <TrustList rows={trustRows} client={client} onRetry={trust.retry} />
          )}
        </SectionCard>
      )}

      <SectionCard label={t('socialRecovery.review.account.header')}>
        <Text fontSize={14} weight="medium" selectable testID="manage-review-account">
          {renderFullAddress(account)}
        </Text>
      </SectionCard>

      {dormantRefused && (
        <Alert
          testID="manage-review-dormant-refused"
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={t(`${REVIEW}.dormantRefused`)}
        />
      )}
      {!dormantRefused && !!gate.blocked && (
        <SaveBlocker
          blocked={gate.blocked}
          onRetry={retryUnanswered}
          onOpen={onOverview}
          onEditor={onEditor}
          onPrivacy={onEditor}
        />
      )}
      {facts && !facts.key && (
        <Alert
          testID="manage-review-view-only"
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={t('socialRecovery.arm.viewOnly')}
        />
      )}
      {gate.notTested && (
        <NotTestedBlock
          untested={gate.notTested}
          enrollments={enrollments}
          addressBook={addressBook}
        />
      )}
      {rows.length === 0 && (
        <Text fontSize={14} style={spacings.mbSm} testID="manage-review-unchanged">
          {t(`${REVIEW}.unchanged`)}
        </Text>
      )}
      {attemptOpen && !dormantRefused && (
        <Text fontSize={14} weight="medium" style={spacings.mbSm} testID="manage-review-cancels">
          {t(`${REVIEW}.cancelsLine`)}
        </Text>
      )}
      {lookingUp ? (
        <ActivityIndicator testID="manage-review-lookup" />
      ) : (
        <ActionsRow
          primary={
            <Button
              testID="manage-review-save"
              type="primary"
              text={t(`${REVIEW}.save`)}
              disabled={!gate.canSave || dormantRefused || !runReady}
              onPress={onSave}
              hasBottomSpacing={false}
            />
          }
          secondary={backToEditor}
        />
      )}
      {lookupFailed && (
        <ReadFailedBlock
          testID="manage-review-lookup-failed"
          title={t('socialRecovery.records.loadFailed')}
          onRetry={onLookAgain}
        />
      )}
    </View>
  )
}

export default React.memo(ReviewArrival)
