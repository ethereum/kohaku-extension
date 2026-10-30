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
import flexbox from '@common/styles/utils/flexbox'
import { MethodRow, SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import { challengeFileOf, challengeTextOf, signatureOf } from './guardian'
import type { OfflineBlockProps } from './types'

const OfflineBlock = ({ challenge, busy, onCheck, saveFile }: OfflineBlockProps) => {
  const { t } = useTranslation()
  const [pasted, setPasted] = useState('')
  const text = useMemo(() => challengeTextOf(challenge.keyTest), [challenge])
  const signature = signatureOf(pasted)

  return (
    <SectionCard tone="muted" spacing="none" testID="guardian-offline" style={spacings.mtSm}>
      <Text fontSize={16} weight="medium" style={spacings.mbTy}>
        {t('socialRecovery.enroll.offline.title')}
      </Text>
      <Text fontSize={14} style={spacings.mbSm}>
        {t('socialRecovery.enroll.offline.lead')}
      </Text>
      <MethodRow style={flexbox.alignStart}>
        <SectionLabel>{t('socialRecovery.enroll.offline.challengeHeader')}</SectionLabel>
        <View style={spacings.mbTy}>
          <QRCode value={text} size={200} quietZone={10} />
        </View>
        <Button
          testID="guardian-offline-save"
          type="secondary"
          size="small"
          text={t('socialRecovery.enroll.offline.saveAsFile')}
          onPress={() => saveFile(challengeFileOf(challenge.keyTest))}
          hasBottomSpacing={false}
        />
      </MethodRow>
      <MethodRow style={spacings.mb0}>
        <SectionLabel>{t('socialRecovery.enroll.offline.bringBackHeader')}</SectionLabel>
        <Input
          testID="guardian-offline-signature"
          label={t('socialRecovery.enroll.offline.pasteSignature')}
          placeholder={t('socialRecovery.enroll.offline.signaturePlaceholder')}
          value={pasted}
          onChangeText={setPasted}
        />
        <View style={flexbox.alignStart}>
          <Button
            testID="guardian-offline-check"
            type="primary"
            size="small"
            text={t('socialRecovery.actions.add')}
            disabled={!signature || busy}
            onPress={() => signature && onCheck(signature)}
            hasBottomSpacing={false}
          />
        </View>
      </MethodRow>
    </SectionCard>
  )
}

export default React.memo(OfflineBlock)
