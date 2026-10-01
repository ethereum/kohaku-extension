/**
 * The offline block: the test challenge carried out as a QR or as a file to a
 * device that never goes online, and the signature brought back. The
 * challenge's text never shows on screen.
 */
import React, { useMemo, useState } from 'react'
import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import { challengeFileOf, challengeTextOf, signatureOf } from './guardian'
import type { OfflineBlockProps } from './types'

const OfflineBlock = ({ challenge, busy, onCheck, saveFile }: OfflineBlockProps) => {
  const { t } = useTranslation()
  const [pasted, setPasted] = useState('')
  const text = useMemo(() => challengeTextOf(challenge.keyTest), [challenge])
  const signature = signatureOf(pasted)

  return (
    <View testID="guardian-offline" style={spacings.mbSm}>
      <Text fontSize={16} weight="semiBold" style={spacings.mbTy}>
        {t('socialRecovery.enroll.offline.title')}
      </Text>
      <Text fontSize={14} style={spacings.mbSm}>
        {t('socialRecovery.enroll.offline.lead')}
      </Text>
      <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mbTy}>
        {t('socialRecovery.enroll.offline.challengeHeader')}
      </Text>
      <View style={spacings.mbTy}>
        <QRCode value={text} size={200} quietZone={10} />
      </View>
      <Button
        testID="guardian-offline-save"
        type="outline"
        text={t('socialRecovery.enroll.offline.saveAsFile')}
        onPress={() => saveFile(challengeFileOf(challenge.keyTest))}
        hasBottomSpacing={false}
      />
      <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mtSm}>
        {t('socialRecovery.enroll.offline.bringBackHeader')}
      </Text>
      <Input
        testID="guardian-offline-signature"
        label={t('socialRecovery.enroll.offline.pasteSignature')}
        placeholder={t('socialRecovery.enroll.offline.signaturePlaceholder')}
        value={pasted}
        onChangeText={setPasted}
      />
      <Button
        testID="guardian-offline-check"
        type="primary"
        text={t('socialRecovery.actions.add')}
        disabled={!signature || busy}
        onPress={() => signature && onCheck(signature)}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(OfflineBlock)
