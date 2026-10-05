/**
 * The review over the setup records: the lead that decides the holder's risk,
 * the trust list with its security stop block and the account's other doors
 * under its expander, the account the save writes to with the key a recovery
 * would remove, and Save behind its gate with the reason it cannot run on
 * screen.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, View } from 'react-native'

import DownArrowIcon from '@common/assets/svg/DownArrowIcon'
import UpArrowIcon from '@common/assets/svg/UpArrowIcon'
import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  SectionLabel,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'
import {
  addressBookOf,
  recoveryChainOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import {
  renderFullAddress,
  renderChip,
  renderNoun,
  renderResolvedName,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import { defaultSetupDraft } from '@web/modules/social-recovery/shared/records/types'

import {
  needsHostileMinorityLine,
  privacyLinesOf,
  publicationSentenceOf,
  renderWait,
  ruleLinesOf
} from './lead'
import PathBlock from './PathBlock'
import { codeEntriesOf, doorsOf } from './doors'
import { accountReadsToRetry, saveGateOf, untestedInPath } from './gate'
import SaveBlocker from './SaveBlocker'
import { methodsOf, stopRowsOf, trustRowsOf } from './trust'
import TrustList from './TrustList'
import type { RetryTarget, ReviewLoad, ReviewViewProps } from './types'
import { useAccountReads } from './useAccountReads'
import { useTrustReads } from './useTrustReads'

const REVIEW = 'socialRecovery.review'

/** The enrollment step's path for one row of the path, where its test runs again. */
const enrollPathOf = ({ kind, clause, member }: RetryTarget): string => {
  const query = new URLSearchParams()
  query.set('kind', kind)
  query.set('clause', String(clause))
  query.set('member', String(member))
  return `/${WEB_ROUTES.socialRecoverySetupEnroll}?${query.toString()}`
}

const ReviewView = ({
  records,
  chainId,
  account,
  client,
  providerKind,
  accountLabel,
  navigate
}: ReviewViewProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [load, setLoad] = useState<ReviewLoad | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [expanded, setExpanded] = useState(false)

  const addressBook = useMemo(
    () => addressBookOf(recoveryChainOf(chainId) ?? WALLET_RECOVERY_CHAIN),
    [chainId]
  )

  useEffect(() => {
    let live = true
    const setup = records.setup(chainId, account)
    Promise.all([setup.setupDraft.read(), setup.enrollments.read(), setup.passwordSet.read()])
      .then(([draft, enrollments, passwordSet]) => {
        if (!live) {
          return
        }
        setLoad({
          draft: draft.status === 'present' ? draft.value : defaultSetupDraft(),
          enrollments: enrollments.status === 'present' ? enrollments.value : [],
          passwordSet: passwordSet.status === 'present'
        })
      })
      .catch(() => {
        if (live) {
          setLoadFailed(true)
        }
      })
    return () => {
      live = false
    }
  }, [records, chainId, account, loadAttempt])

  const retryLoad = () => {
    setLoadFailed(false)
    setLoadAttempt((attempt) => attempt + 1)
  }

  const ready = client.status === 'ready' ? client.client : null
  const clauses = useMemo(() => load?.draft.clauses ?? [], [load])
  const methods = useMemo(() => methodsOf(clauses, addressBook), [clauses, addressBook])
  const { reads, retry } = useTrustReads(ready?.moduleReads ?? null, methods)
  const rows = useMemo(
    () =>
      trustRowsOf({
        clauses,
        enrollments: load?.enrollments ?? [],
        reads,
        shippedMethods: ready?.descriptor.shippedMethods ?? [],
        addressBook
      }),
    [clauses, load, reads, ready, addressBook]
  )
  const stopRows = useMemo(() => stopRowsOf(rows), [rows])
  const accountReads = useAccountReads(ready, load?.draft ?? null)
  const doors = useMemo(
    () => doorsOf(accountReads.privilegeHolders, codeEntriesOf(), accountReads.removedKey),
    [accountReads.privilegeHolders, accountReads.removedKey]
  )

  const line = (text: string, testID?: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )
  const note = (text: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  const back = (
    <Button
      testID="review-back"
      type="outline"
      text={t('socialRecovery.ceremony.backAction')}
      onPress={() => navigate(WEB_ROUTES.socialRecoverySetupPrivacy)}
      hasBottomSpacing={false}
    />
  )

  const title = (
    <PageTitle title={t(`${REVIEW}.title`)} lead={t(`${REVIEW}.lead`)} titleTestID="review-title" />
  )

  if (!load) {
    return (
      <View testID="review">
        {title}
        {loadFailed ? (
          <>
            <Alert
              type="error"
              size="sm"
              text={
                <Alert.Text size="sm" type="error" testID="review-load-failed">
                  {t('socialRecovery.records.loadFailed')}
                </Alert.Text>
              }
            />
            <ActionsRow
              primary={
                <Button
                  testID="review-load-retry"
                  type="primary"
                  text={t('socialRecovery.writes.tryAgain')}
                  onPress={retryLoad}
                  hasBottomSpacing={false}
                />
              }
              secondary={back}
            />
          </>
        ) : (
          <ActivityIndicator testID="review-spinner" />
        )}
      </View>
    )
  }

  const { draft } = load
  const ruleLines = ruleLinesOf(draft, addressBook, t)
  const publication = publicationSentenceOf(clauses, addressBook, t)
  const name = accountLabel ? renderResolvedName(accountLabel, 'besideAddressToCheck', t) : null
  const gate = saveGateOf({
    recordsLoaded: true,
    clientReady: !!ready,
    trustRows: rows,
    removedKey: accountReads.removedKey,
    fitCheck: accountReads.fitCheck,
    setupState: accountReads.setupState,
    description: accountReads.description,
    untested: untestedInPath(clauses, load.enrollments),
    clauses,
    backup: draft.privacy.backup,
    passwordSet: load.passwordSet
  })
  const { removedKey } = accountReads

  // Runs again every read that did not answer: the trust list's reads of each
  // method and the account's reads that threw.
  const retryUnanswered = () => {
    rows
      .filter(({ contract }) => contract.status === 'unavailable')
      .forEach(({ method }) => retry(method))
    accountReads.retry(accountReadsToRetry(accountReads))
  }

  let clientRefusal: { title: string; body: string } | null = null
  if (client.status === 'update-the-wallet') {
    clientRefusal = {
      title: t('socialRecovery.client.updateTheWalletTitle'),
      body: t('socialRecovery.client.updateTheWalletBody')
    }
  } else if (client.status === 'failed') {
    clientRefusal = {
      title: t('socialRecovery.client.unavailableTitle'),
      body: t('socialRecovery.client.unavailableBody')
    }
  }

  const clientRetry = (client.status === 'update-the-wallet' || client.status === 'failed') && (
    <Button
      testID="review-client-retry"
      type="secondary"
      size="small"
      text={t('socialRecovery.writes.tryAgain')}
      onPress={client.retry}
      hasBottomSpacing={false}
      style={spacings.mrSm}
    />
  )

  return (
    <View testID="review">
      {title}

      <SectionCard>
        <PathBlock
          clauses={clauses}
          enrollments={load.enrollments}
          addressBook={addressBook}
          onRetryTest={(target) => navigate(enrollPathOf(target))}
        />
        {needsHostileMinorityLine(clauses) &&
          line(t(`${REVIEW}.hostileMinority`), 'review-hostile-minority')}
      </SectionCard>

      <SectionCard label={t('socialRecovery.shape.header')} testID="review-rule-lines">
        {ruleLines.map((ruleLine, index) => (
          <Text
            // The rule lines of one path are fixed in number and order.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            fontSize={14}
            style={spacings.mbTy}
            testID={`review-rule-line-${index}`}
          >
            {ruleLine}
          </Text>
        ))}
        {line(t(`${REVIEW}.spareKey`), 'review-spare-key')}
      </SectionCard>

      <SectionCard label={renderNoun('waitingPeriod', t)}>
        <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="review-wait">
          {renderWait(draft.wait, t)}
        </Text>
        <Text fontSize={12} appearance="secondaryText">
          {t(`${REVIEW}.minimum`)}
        </Text>
      </SectionCard>

      <SectionCard label={t(`${REVIEW}.costsHeader`)} testID="review-costs">
        {line(t('socialRecovery.costLines.recovery'))}
        {line(t(`${REVIEW}.publication.lead`), 'review-publication-lead')}
        {!!publication && line(publication, 'review-publication')}
        {line(t('socialRecovery.costLines.save'), 'review-save-cost')}
      </SectionCard>

      <SectionCard label={t(`${REVIEW}.privacyHeader`)} testID="review-privacy">
        {privacyLinesOf(draft, addressBook, load.passwordSet, t).map((privacyLine, index) => (
          <Text
            // The privacy lines of one level are fixed in number and order.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            fontSize={14}
            weight={index === 0 ? 'medium' : 'regular'}
            style={spacings.mbTy}
            testID={`review-privacy-${index}`}
          >
            {privacyLine}
          </Text>
        ))}
      </SectionCard>

      <Pressable
        testID="review-verify-details"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((open) => !open)}
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          common.borderRadiusPrimary,
          spacings.ph,
          spacings.pvSm,
          expanded ? spacings.mbTy : spacings.mbLg,
          {
            borderWidth: 1,
            borderColor: theme.secondaryBorder,
            backgroundColor: theme.secondaryBackground
          }
        ]}
      >
        <Text fontSize={14} weight="medium">
          {t(`${REVIEW}.verifyDetails`)}
        </Text>
        {expanded ? <UpArrowIcon /> : <DownArrowIcon />}
      </Pressable>
      {expanded && (!!ready || client.status === 'loading') && (
        <SectionCard>
          {ready ? (
            <TrustList
              rows={rows}
              stopRows={stopRows}
              doors={doors}
              client={ready}
              providerKind={providerKind}
              onRetry={retry}
            />
          ) : (
            <ActivityIndicator testID="review-trust-spinner" />
          )}
        </SectionCard>
      )}

      <SectionCard label={t(`${REVIEW}.account.header`)} testID="review-account">
        {!!name && (
          <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="review-account-label">
            {name.name}
          </Text>
        )}
        <Text
          fontSize={14}
          weight="number_medium"
          selectable
          style={spacings.mbTy}
          testID="review-account-address"
        >
          {renderFullAddress(account)}
        </Text>
        {note(t(`${REVIEW}.account.check`), 'review-account-check')}
        {!!name?.caveat && note(name.caveat, 'review-account-caveat')}
        {removedKey.status === 'answered' && removedKey.value.kind === 'named' && (
          <View style={spacings.mtTy} testID="review-removed-key">
            <View
              style={[
                common.borderRadiusPrimary,
                spacings.phSm,
                spacings.pvSm,
                spacings.mbTy,
                { backgroundColor: theme.secondaryBackground }
              ]}
            >
              <SectionLabel>{renderValueLabel('keyBeingRemoved', t)}</SectionLabel>
              <Text
                fontSize={14}
                weight="number_medium"
                selectable
                testID="review-removed-key-address"
              >
                {renderFullAddress(removedKey.value.key)}
              </Text>
            </View>
            <Text fontSize={12} appearance="secondaryText" testID="review-removed-key-line">
              {t(`${REVIEW}.keyRemovedLine`)}
            </Text>
          </View>
        )}
        {!!ready && removedKey.status === 'pending' && (
          <ActivityIndicator testID="review-removed-key-pending" />
        )}
      </SectionCard>

      {!!clientRefusal && (
        <View style={spacings.mbLg} testID="review-client-refusal">
          <Alert type="error" size="sm" title={clientRefusal.title} text={clientRefusal.body} />
        </View>
      )}

      {!!gate.blocked && (
        <SaveBlocker
          blocked={gate.blocked}
          onRetry={retryUnanswered}
          onOpen={() => navigate(WEB_ROUTES.socialRecoveryManage)}
          onEditor={() => navigate(WEB_ROUTES.socialRecoverySetupEditor)}
          onPrivacy={() => navigate(WEB_ROUTES.socialRecoverySetupPrivacy)}
        />
      )}

      {gate.notTested && (
        <SectionCard testID="review-not-tested">
          <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
            <StatusChip
              text={renderChip('method', 'notTested', t)}
              tone="warning"
              style={spacings.mrSm}
            />
            <Text fontSize={16} weight="medium">
              {t(`${REVIEW}.blocked.notTested.title`)}
            </Text>
          </View>
          <Text fontSize={14} appearance="secondaryText">
            {t(`${REVIEW}.blocked.notTested.body`)}
          </Text>
        </SectionCard>
      )}

      <ActionsRow
        primary={
          <Button
            testID="review-save"
            type="primary"
            text={t(`${REVIEW}.save`)}
            disabled={!gate.canSave}
            onPress={() => navigate(WEB_ROUTES.socialRecoverySetupSave)}
            hasBottomSpacing={false}
          />
        }
        secondary={
          <>
            {clientRetry}
            {back}
          </>
        }
        note={t(`${REVIEW}.oneConfirmation`)}
      />
    </View>
  )
}

export default React.memo(ReviewView)
