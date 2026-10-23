/**
 * The signing step: the value block with the deadline beside it, the
 * acknowledgment, the key the request names and whether this wallet holds
 * it, and the sign action. The heading asks to sign the approval until the
 * box is ticked and reads ready once it is. Sign stays disabled until every
 * gate holds; under it, while the box is not ticked, the line that asks for
 * the tick. While a signature is asked for, the action is busy beside a line
 * that says the wallet's sign screen is awaited. A signing that brought no approval reads why,
 * with a retry. The step also offers the offline block and keeps decline
 * open.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'

import AcknowledgmentBox from './AcknowledgmentBox'
import type { KeyReading, SignBlockProps } from './types'
import ValueBlock from './ValueBlock'
import { fullAddressOf } from './values'

const PAGE = 'socialRecovery.guardianPage'
const SIGNING = `${PAGE}.signing`

const SignBlock = ({
  acknowledged,
  onAcknowledged,
  enabled,
  values,
  deadline,
  keyReading,
  busy,
  failure,
  onSign,
  onOpenOffline,
  onDecline
}: SignBlockProps) => {
  const { t } = useTranslation()

  const keyLines = (reading: KeyReading) => {
    if (reading.kind === 'unreadable') {
      return (
        <Text fontSize={14} appearance="errorText" testID="guardian-key-unreadable">
          {t('socialRecovery.guardianPage.notReadable')}
        </Text>
      )
    }
    const address = reading.kind === 'held' ? reading.key.addr : reading.address
    const full = fullAddressOf(address) ?? address
    if (reading.kind === 'missing') {
      return (
        <Text fontSize={14} appearance="errorText" testID="guardian-key-missing">
          {t(`${SIGNING}.keyMissing`, { address: full })}
        </Text>
      )
    }
    return (
      <>
        <Text fontSize={14} weight="number_medium" selectable testID="guardian-key-address">
          {full}
        </Text>
        <Text
          fontSize={14}
          style={spacings.mtTy}
          testID={reading.kind === 'held' ? 'guardian-key-held' : 'guardian-key-locked'}
        >
          {t(reading.kind === 'held' ? `${SIGNING}.keyHeld` : `${SIGNING}.unlock`)}
        </Text>
      </>
    )
  }

  return (
    <View testID="guardian-sign-block">
      <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="guardian-signing-title">
        {t(acknowledged ? `${SIGNING}.titleReady` : `${SIGNING}.title`)}
      </Text>
      <Text fontSize={14} style={spacings.mbSm} testID="guardian-signing-lead">
        {t(`${SIGNING}.lead`)}
      </Text>
      <ValueBlock values={values} deadline={deadline} testID="guardian-signing-values" />
      <AcknowledgmentBox acknowledged={acknowledged} onAcknowledged={onAcknowledged} />
      <SectionCard testID="guardian-key">
        <SectionLabel>{t(`${SIGNING}.keyHeading`)}</SectionLabel>
        {keyLines(keyReading)}
      </SectionCard>
      {!!failure && (
        <Alert
          testID={`guardian-sign-${failure}`}
          type="error"
          size="sm"
          style={spacings.mbSm}
          title={t(`${SIGNING}.${failure}`)}
        >
          <View style={[flexbox.directionRow, spacings.mtTy]}>
            <Button
              testID="guardian-sign-retry"
              type="secondary"
              size="small"
              text={t(`${PAGE}.actions.tryAgain`)}
              disabled={!enabled || busy}
              onPress={onSign}
              hasBottomSpacing={false}
            />
          </View>
        </Alert>
      )}
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
        <Button
          testID="guardian-sign"
          type="primary"
          text={t(`${PAGE}.actions.sign`)}
          disabled={!enabled || busy}
          onPress={onSign}
          hasBottomSpacing={false}
        />
        {busy && (
          <View testID="guardian-sign-busy" style={spacings.mlSm}>
            <LoadingBlock
              variant="row"
              message={t('socialRecovery.enroll.guardian.waitingForSignScreen')}
            />
          </View>
        )}
      </View>
      {!acknowledged && (
        <Text
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mbSm}
          testID="guardian-tick-first"
        >
          {t(`${PAGE}.acknowledgment.tickFirst`)}
        </Text>
      )}
      <SectionCard testID="guardian-offline-entry">
        <Button
          testID="guardian-offline-open"
          type="secondary"
          size="small"
          text={t(`${PAGE}.offline.open`)}
          onPress={onOpenOffline}
          hasBottomSpacing={false}
        />
        <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
          {t(`${PAGE}.offline.openHint`)}
        </Text>
      </SectionCard>
      <Button
        testID="guardian-decline"
        type="secondary"
        text={t(`${PAGE}.actions.decline`)}
        onPress={onDecline}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(SignBlock)
