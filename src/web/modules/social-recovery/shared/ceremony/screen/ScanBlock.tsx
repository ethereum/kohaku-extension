/**
 * The phone's part of a ceremony: the code the holder's app scans, with the
 * line that one scan is all it takes, the line of the phone's latest answer,
 * and the cancel. Before the method shows its
 * code, the block waits for the phone with no code drawn.
 */
import React from 'react'
import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'

import type { ScanBlockProps } from './types'

const ScanBlock = ({ url, step, phoneReads, onCancel }: ScanBlockProps) => {
  const { t } = useTranslation()

  // The line each of the phone's answers shows under the code. The result's
  // line stays while the method packages and checks it.
  const stepLine = () => {
    switch (step) {
      case 'requestReceived':
        return t('socialRecovery.ceremony.requestReceived')
      case 'generating':
        return t('socialRecovery.ceremony.generating')
      case 'resultReceived':
      case 'packaging':
      case 'checking':
        return t('socialRecovery.ceremony.resultReceived')
      default:
        return t('socialRecovery.ceremony.waitingForPhone')
    }
  }

  return (
    <View style={[flexbox.alignCenter]}>
      <Text weight="semiBold" fontSize={18} style={spacings.mbSm}>
        {t('socialRecovery.ceremony.continueOnPhone')}
      </Text>
      <Text appearance="secondaryText" style={[spacings.mbLg, { textAlign: 'center' }]}>
        {url ? t('socialRecovery.ceremony.scanWithApp') : t('socialRecovery.ceremony.scanCode')}
      </Text>
      {!!url && (
        <View style={spacings.mbLg} testID="ceremony-scan-code">
          <QRCode value={url} size={200} quietZone={10} />
        </View>
      )}
      {!!url && (
        <Text appearance="secondaryText" style={[spacings.mbLg, { textAlign: 'center' }]}>
          {t('socialRecovery.ceremony.scanOnce')}
        </Text>
      )}
      <LoadingBlock variant="block" message={stepLine()} />
      <Text appearance="secondaryText" style={{ textAlign: 'center' }}>
        {t('socialRecovery.ceremony.keepTabOpen')}
      </Text>
      {phoneReads && (
        <Text appearance="secondaryText" style={[spacings.mtSm, { textAlign: 'center' }]}>
          {t('socialRecovery.ceremony.phoneReads')}
        </Text>
      )}
      <Button
        type="secondary"
        text={t('socialRecovery.ceremony.cancelAction')}
        onPress={onCancel}
        style={spacings.mtLg}
      />
    </View>
  )
}

export default React.memo(ScanBlock)
