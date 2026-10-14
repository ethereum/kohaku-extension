import React from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { auditedActionOf, publisherKeyOf } from '@web/modules/social-recovery/shared/client'
import { renderFullAddress, renderNoun } from '@web/modules/social-recovery/shared/display'
import { isEmptySlot } from '@web/modules/social-recovery/shared/records/slots'

import { kindNameOf, passkeyLinesOf } from './lead'
import type { AdminDeclaration, TrustHeading, TrustListProps, TrustRow } from './types'

const TRUST = 'socialRecovery.review.trust'

/**
 * The trust list in titled sections: one per method contract, titled with the
 * method's kind, holding the headings of the path rows that use it, the
 * contract's row and each heading's own lines; then the recovery module with
 * its publisher; then the lines that hold for every declaration above.
 */
const TrustList = ({ rows, client, onRetry }: TrustListProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  const headingText = (heading: TrustHeading, row: TrustRow): string => {
    // A slot not enrolled yet has no name of its own: it shows its kind.
    if (heading.kind && isEmptySlot(heading.credential)) {
      return kindNameOf(heading.kind, t)
    }
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

  const adminLines = (declaration: AdminDeclaration, testID: string) => (
    <>
      {!!declaration.admin && line(t(`${TRUST}.adminLine`), `${testID}-admin`)}
      {!!declaration.pendingAdmin &&
        line(
          t(`${TRUST}.oneAcceptanceAway`, { address: renderFullAddress(declaration.pendingAdmin) }),
          `${testID}-pending-admin`
        )}
      {declaration.recoverAlone &&
        line(
          declaration.aloneAtThresholdOne
            ? t(`${TRUST}.recoverAlone`)
            : t(`${TRUST}.recoverAloneAny`),
          `${testID}-recover-alone`
        )}
    </>
  )

  const renderContract = (row: TrustRow, testID: string) => {
    const { contract } = row
    if (contract.status === 'pending') {
      return <ActivityIndicator testID={`${testID}-pending`} style={spacings.mbTy} />
    }
    if (contract.status === 'unavailable') {
      return (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
          <StatusChip
            text={t('socialRecovery.review.blocked.unavailable.chip')}
            tone="error"
            testID={`${testID}-unavailable`}
            style={spacings.mrSm}
          />
          <Button
            testID={`${testID}-retry`}
            type="secondary"
            size="small"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={() => onRetry(row.method)}
            hasBottomSpacing={false}
          />
        </View>
      )
    }
    if (contract.status === 'third-party') {
      const declaration = contract.declaration
      if (!declaration?.admin) {
        return (
          <>
            {line(t(`${TRUST}.thirdPartyRow`), `${testID}-third-party`)}
            {line(t(`${TRUST}.thirdPartyLine`))}
          </>
        )
      }
      return (
        <>
          {line(
            t(`${TRUST}.thirdPartyDeclaredRow`, { party: renderFullAddress(declaration.admin) }),
            `${testID}-third-party`
          )}
          {adminLines(declaration, testID)}
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
        {adminLines(contract, testID)}
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
          <SectionCard
            key={row.method}
            label={row.kind ? kindNameOf(row.kind, t) : renderFullAddress(row.method)}
            spacing="item"
            testID={testID}
          >
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
                style={spacings.mbTy}
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
          </SectionCard>
        )
      })}
      <SectionCard
        label={renderNoun('recoveryModule', t)}
        spacing="item"
        testID="review-trust-module"
      >
        {action.kind === 'audited' && (
          <Text fontSize={14} weight="medium" style={spacings.mbTy}>
            {t(`${TRUST}.moduleRow`, { publisher: t(publisherKeyOf(action)) })}
          </Text>
        )}
        {line(t(`${TRUST}.moduleAuthority`))}
        {line(t(`${TRUST}.auditedOnly`))}
      </SectionCard>
      <View style={spacings.mtTy}>
        {line(t(`${TRUST}.selfAttested`))}
        {line(t(`${TRUST}.deadProvider`))}
      </View>
    </View>
  )
}

export default React.memo(TrustList)
