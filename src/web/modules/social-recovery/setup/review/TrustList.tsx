import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { auditedActionOf, publisherKeyOf } from '@web/modules/social-recovery/shared/client'
import { renderFullAddress, renderNoun } from '@web/modules/social-recovery/shared/display'
import { isEmptySlot } from '@web/modules/social-recovery/shared/records/slots'

import { kindNameOf, passkeyLinesOf } from './lead'
import { nodeKindOf } from './trust'
import type { TrustHeading, TrustListProps, TrustRow } from './types'

const TRUST = 'socialRecovery.review.trust'

/**
 * The trust list: one contract row per method under the headings of the path
 * rows that use it, each heading's own lines after the row, the recovery
 * module with its publisher, and the node the wallet reads through.
 */
const TrustList = ({ rows, client, providerKind, onRetry }: TrustListProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  const headingText = (heading: TrustHeading, row: TrustRow): string => {
    if (heading.kind === 'ecdsa') {
      if (!heading.guardian) {
        return renderNoun('guardian', t)
      }
      const address = renderFullAddress(heading.guardian)
      return heading.tested
        ? t(`${TRUST}.guardianHeadingTested`, { address })
        : t(`${TRUST}.guardianHeading`, { address })
    }
    if (heading.kind === 'passkey') {
      return heading.credential.label || kindNameOf('passkey', t)
    }
    if (heading.kind) {
      return kindNameOf(heading.kind, t)
    }
    return renderFullAddress(row.method)
  }

  const headingLinesOf = (heading: TrustHeading): string[] => {
    if (heading.kind === 'ecdsa') {
      return [t('socialRecovery.disclosures.smartAccount')]
    }
    if (isEmptySlot(heading.credential)) {
      return []
    }
    if (heading.kind === 'passkey') {
      return passkeyLinesOf(heading.backup, t)
    }
    if (heading.kind === 'zkpassport' || heading.kind === 'aadhaar') {
      return [t('socialRecovery.disclosures.identity')]
    }
    return []
  }

  const renderContract = (row: TrustRow, testID: string) => {
    const { contract } = row
    if (contract.status === 'pending') {
      return <ActivityIndicator testID={`${testID}-pending`} />
    }
    if (contract.status === 'unavailable') {
      return (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
          <Text
            fontSize={12}
            weight="medium"
            appearance="errorText"
            style={spacings.mrSm}
            testID={`${testID}-unavailable`}
          >
            {t('socialRecovery.review.blocked.unavailable.chip')}
          </Text>
          <Button
            testID={`${testID}-retry`}
            type="outline"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={() => onRetry(row.method)}
            hasBottomSpacing={false}
          />
        </View>
      )
    }
    if (contract.status === 'third-party') {
      return (
        <>
          {line(t(`${TRUST}.thirdPartyRow`), `${testID}-third-party`)}
          {line(t(`${TRUST}.thirdPartyLine`))}
        </>
      )
    }
    const method = row.kind ? kindNameOf(row.kind, t) : renderFullAddress(row.method)
    return (
      <>
        {contract.admin
          ? line(
              t(`${TRUST}.methodRowAdmin`, { method, party: renderFullAddress(contract.admin) }),
              `${testID}-method`
            )
          : line(t(`${TRUST}.methodRow`, { method }), `${testID}-method`)}
        {!!contract.admin && line(t(`${TRUST}.adminLine`), `${testID}-admin`)}
        {!!contract.pendingAdmin &&
          line(
            t(`${TRUST}.oneAcceptanceAway`, { address: renderFullAddress(contract.pendingAdmin) }),
            `${testID}-pending-admin`
          )}
        {contract.recoverAlone && line(t(`${TRUST}.recoverAlone`), `${testID}-recover-alone`)}
        {contract.passportRenewal && line(t(`${TRUST}.passportRenewal`), `${testID}-renewal`)}
      </>
    )
  }

  const action = auditedActionOf(client.descriptor.action, client.chain)

  return (
    <View testID="review-trust-list">
      {rows.map((row, index) => {
        const testID = `review-trust-${index}`
        return (
          <View key={row.method} testID={testID} style={spacings.mbSm}>
            {!!row.guardians &&
              line(
                row.guardians.tested === row.guardians.count
                  ? t(`${TRUST}.guardiansAllTested`, { count: row.guardians.count })
                  : t(`${TRUST}.guardiansSomeTested`, {
                      count: row.guardians.count,
                      tested: row.guardians.tested
                    }),
                `${testID}-guardians`
              )}
            {row.headings.map((heading, member) => (
              <Text
                // A heading is one row of the path; the path fixes their order.
                // eslint-disable-next-line react/no-array-index-key
                key={member}
                fontSize={14}
                weight="medium"
                testID={`${testID}-heading-${member}`}
              >
                {headingText(heading, row)}
              </Text>
            ))}
            {renderContract(row, testID)}
            {row.headings.map((heading, member) =>
              headingLinesOf(heading).map((text, place) => (
                // The lines of one heading are fixed in number and order.
                // eslint-disable-next-line react/no-array-index-key
                <React.Fragment key={`${member}-${place}`}>
                  {line(text, `${testID}-heading-${member}-line-${place}`)}
                </React.Fragment>
              ))
            )}
          </View>
        )
      })}
      <View testID="review-trust-module" style={spacings.mbSm}>
        <Text fontSize={14} weight="medium">
          {action.kind === 'audited'
            ? t(`${TRUST}.moduleRow`, { publisher: t(publisherKeyOf(action)) })
            : renderNoun('recoveryModule', t)}
        </Text>
        {line(t(`${TRUST}.moduleAuthority`))}
        {line(t(`${TRUST}.auditedOnly`))}
      </View>
      {line(
        nodeKindOf(providerKind) === 'light-client'
          ? t(`${TRUST}.nodeLightClient`)
          : t(`${TRUST}.nodePlain`),
        'review-trust-node'
      )}
      {line(t(`${TRUST}.selfAttested`))}
      {line(t(`${TRUST}.deadProvider`))}
    </View>
  )
}

export default React.memo(TrustList)
