/**
 * The review over the setup records: the path with its rule lines, the
 * waiting period and the privacy level, the account the save writes to on one
 * line with its address in full, and Save behind its gate with the reason it
 * cannot run on screen. The save screen adds the key a recovery would remove. The trust list under
 * its expander follows the account in the main column, since its retry can
 * unlock Save. An untested method is named once, beside Save. What a recovery
 * publishes and the spare-key comparison sit beside them.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

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
  StatusChip,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import RefreshingLine from '@web/modules/social-recovery/shared/chrome/RefreshingLine'
import {
  addressBookOf,
  recoveryChainOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import {
  renderChip,
  renderFullAddress,
  renderNoun,
  renderResolvedName,
  renderWaitLength
} from '@web/modules/social-recovery/shared/display'
import { defaultSetupDraft } from '@web/modules/social-recovery/shared/records/types'
import { WAIT_FLOOR_SECONDS } from '@web/modules/social-recovery/setup/privacy/wait'

import {
  kindNameOf,
  kindOf,
  needsHostileMinorityLine,
  pathRowOf,
  privacyLinesOf,
  publicationSentenceOf,
  renderWait,
  ruleLinesOf
} from './lead'
import PathBlock from './PathBlock'
import { accountReadsToRetry, saveGateOf, untestedInPath } from './gate'
import SaveBlocker from './SaveBlocker'
import { methodsOf, trustRowsOf } from './trust'
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
  accountLabel,
  basicAccount,
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
  const accountReads = useAccountReads(ready, load?.draft ?? null)

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
      <TwoColumn testID="review-columns" grow={!loadFailed}>
        <View testID="review" style={loadFailed ? undefined : flexbox.flex1}>
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
            <LoadingBlock variant="screen" message={t('socialRecovery.loading.draft')} />
          )}
        </View>
      </TwoColumn>
    )
  }

  const { draft } = load
  const publication = publicationSentenceOf(clauses, addressBook, t)
  const ruleLines = ruleLinesOf(draft, addressBook, t)
  const name = accountLabel ? renderResolvedName(accountLabel, 'informationOnly', t) : null
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
    passwordSet: load.passwordSet,
    basicAccount
  })

  // Save waits on the client and on reads that have not answered; no block
  // shows until they settle, so a line beside the held Save says what runs.
  const checking =
    client.status === 'loading' || (!!ready && !gate.canSave && gate.blocked === null)

  // Runs again every read that did not answer: the trust list's reads of each
  // method and the account's reads that threw.
  const retryUnanswered = () => {
    rows
      .filter(({ contract }) => contract.status === 'unavailable')
      .forEach(({ method }) => retry(method))
    accountReads.retry(accountReadsToRetry(accountReads, basicAccount))
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
      text={t('socialRecovery.writes.tryAgain')}
      onPress={client.retry}
      hasBottomSpacing={false}
      style={spacings.mrSm}
    />
  )

  const aside = (
    <>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${REVIEW}.publicationHeader`)}
        testID="review-what-publishes"
      >
        {note(t(`${REVIEW}.publication.lead`), 'review-publication-lead')}
        {!!publication && note(publication, 'review-publication')}
      </SectionCard>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${REVIEW}.spareKeyHeader`)}
        testID="review-comparison"
      >
        {note(t(`${REVIEW}.spareKey`), 'review-spare-key')}
      </SectionCard>
    </>
  )

  return (
    <TwoColumn testID="review-columns" aside={aside}>
      <View testID="review">
        {title}

        <SectionCard>
          <PathBlock
            clauses={clauses}
            enrollments={load.enrollments}
            addressBook={addressBook}
            onRetryTest={(target) => navigate(enrollPathOf(target))}
          />
          {ruleLines.length > 0 && (
            <View style={spacings.mtSm} testID="review-rule-lines">
              {ruleLines.map((ruleLine, index) => (
                <Text
                  // The lines are rebuilt from the path on every render, so a
                  // line's place is its identity.
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  fontSize={14}
                  style={spacings.mbTy}
                  testID={`review-rule-line-${index}`}
                >
                  {ruleLine}
                </Text>
              ))}
            </View>
          )}
          {needsHostileMinorityLine(clauses) &&
            line(t(`${REVIEW}.hostileMinority`), 'review-hostile-minority')}
        </SectionCard>

        <SectionCard label={renderNoun('waitingPeriod', t)}>
          <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="review-wait">
            {renderWait(draft.wait, t)}
          </Text>
          <Text fontSize={12} appearance="secondaryText" testID="review-wait-minimum">
            {t(`${REVIEW}.minimum`, { minimum: renderWaitLength(WAIT_FLOOR_SECONDS, t) })}
          </Text>
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

        <SectionCard label={t(`${REVIEW}.account.header`)} testID="review-account">
          <Text fontSize={14} weight="medium" selectable testID="review-account-line">
            {name
              ? t('socialRecovery.display.nameWithAccount', {
                  name: name.name,
                  account: renderFullAddress(account)
                })
              : renderFullAddress(account)}
          </Text>
        </SectionCard>

        <View testID="review-details">
          <Pressable
            testID="review-verify-details"
            accessibilityRole="button"
            // react-native-web renders this as aria-expanded; the React Native
            // types do not declare it, so it travels in a spread
            {...{ accessibilityExpanded: expanded }}
            onPress={() => setExpanded((open) => !open)}
            style={[
              flexbox.directionRow,
              flexbox.alignCenter,
              flexbox.justifySpaceBetween,
              common.borderRadiusPrimary,
              spacings.ph,
              spacings.pvSm,
              spacings.mbSm,
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
          {expanded && !!ready && (
            <View style={spacings.mbSm}>
              <TrustList rows={rows} client={ready} onRetry={retry} />
            </View>
          )}
          {expanded && client.status === 'loading' && (
            <SectionCard testID="review-trust-loading">
              <LoadingBlock variant="block" message={t('socialRecovery.loading.trust')} />
            </SectionCard>
          )}
        </View>

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
              <StatusChip text={renderChip('method', 'notTested', t)} style={spacings.mrSm} />
              <Text fontSize={16} weight="medium">
                {t(`${REVIEW}.blocked.notTested.title`, { count: gate.notTested.length })}
              </Text>
            </View>
            {gate.notTested.map(({ credential, clause, member }) => {
              const testID = `review-not-tested-${clause}-${member}`
              const rowName = pathRowOf(credential, load.enrollments, addressBook, t).name
              const kind = kindOf(credential, addressBook)
              // A row named by its kind alone, a passkey with no label or an
              // identity method, does not repeat the kind beside the name.
              const kindName = kind && kindNameOf(kind, t) !== rowName ? kindNameOf(kind, t) : null
              return (
                <View
                  key={testID}
                  testID={testID}
                  style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}
                >
                  <Text
                    fontSize={14}
                    weight="medium"
                    style={spacings.mrTy}
                    testID={`${testID}-name`}
                  >
                    {rowName}
                  </Text>
                  {!!kindName && (
                    <Text fontSize={14} appearance="secondaryText" testID={`${testID}-kind`}>
                      {kindName}
                    </Text>
                  )}
                </View>
              )
            })}
            <Text fontSize={14} appearance="secondaryText">
              {t(`${REVIEW}.blocked.notTested.body`)}
            </Text>
          </SectionCard>
        )}

        <ActionsRow
          primary={
            <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
              <Button
                testID="review-save"
                type="primary"
                text={t(`${REVIEW}.save`)}
                disabled={!gate.canSave}
                onPress={() => navigate(WEB_ROUTES.socialRecoverySetupSave)}
                hasBottomSpacing={false}
              />
              {checking && (
                <View testID="review-save-checking" style={spacings.mlSm}>
                  <RefreshingLine messageKey="socialRecovery.loading.saveChecks" />
                </View>
              )}
            </View>
          }
          secondary={
            <>
              {clientRetry}
              {back}
            </>
          }
        />
      </View>
    </TwoColumn>
  )
}

export default React.memo(ReviewView)
