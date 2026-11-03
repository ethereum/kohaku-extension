/**
 * The upload of the Aadhaar QR image: the pick button, the line that the
 * picked image held no code, and the cancel.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import type { UploadBlockProps } from './types'

const UploadBlock = ({ noQrFound, onChoose, onCancel }: UploadBlockProps) => {
  const { t } = useTranslation()

  return (
    <View style={[flexbox.alignCenter]}>
      <Text weight="semiBold" fontSize={18} style={spacings.mbSm}>
        {t('socialRecovery.ceremony.uploadTitle')}
      </Text>
      <Text appearance="secondaryText" style={[spacings.mbLg, { textAlign: 'center' }]}>
        {t('socialRecovery.ceremony.uploadHint')}
      </Text>
      <Button
        type="primary"
        text={t('socialRecovery.ceremony.chooseImage')}
        onPress={onChoose}
        testID="ceremony-choose-image"
      />
      {noQrFound && (
        <Text appearance="errorText" style={[spacings.mtSm, { textAlign: 'center' }]}>
          {t('socialRecovery.ceremony.noQrFound')}
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

export default React.memo(UploadBlock)
