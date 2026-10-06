/**
 * The passkey row before the slot holds a credential: the name, the creation
 * on this device or on a phone, and the note a creation that did not pass
 * left.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { browserErrorNameOf, noteKeyOfOutcome } from '@web/modules/social-recovery/shared/ceremony'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { NAME_MAX_LENGTH } from '@web/modules/social-recovery/shared/display'

import { clipName } from './passkey'
import type { PasskeyCreateBlockProps } from './types'

const PasskeyCreateBlock = ({
  name,
  setName,
  enrollOutcome,
  busy,
  phone,
  create,
  served
}: PasskeyCreateBlockProps) => {
  const { t } = useTranslation()
  const enrollNote = enrollOutcome ? noteKeyOfOutcome(enrollOutcome, 'enroll') : null
  const enrollError = enrollOutcome ? browserErrorNameOf(enrollOutcome) : null
  const enrollRetry = !!enrollOutcome && (enrollOutcome.kind === 'dismissed' || enrollOutcome.retry)

  return (
    <View testID="passkey-create">
      <Input
        testID="passkey-name"
        label={t('socialRecovery.enroll.passkey.nameLabel')}
        value={name}
        maxLength={NAME_MAX_LENGTH}
        onChangeText={(text: string) => setName(clipName(text))}
      />
      <SectionCard tone="muted" spacing={served ? 'item' : 'none'}>
        <Text testID="passkey-none-yet" fontSize={16} weight="medium" style={spacings.mbTy}>
          {t('socialRecovery.enroll.passkey.noneYet')}
        </Text>
        {!!enrollNote && (
          <Text testID="passkey-enroll-note" fontSize={14} appearance="errorText">
            {t(enrollNote)}
          </Text>
        )}
        {!!enrollError && (
          <Text testID="passkey-enroll-error" fontSize={12} appearance="secondaryText">
            {enrollError}
          </Text>
        )}
        {enrollRetry && served && (
          <ActionsRow
            primary={
              <Button
                testID="passkey-try-again"
                type="secondary"
                size="small"
                text={t('socialRecovery.ceremony.tryAgainAction')}
                disabled={busy}
                onPress={() => create(phone)}
                hasBottomSpacing={false}
              />
            }
          />
        )}
        {served && (
          <>
            <Text fontSize={14} style={[spacings.mtSm, spacings.mbTy]}>
              {t('socialRecovery.enroll.passkey.createLine')}
            </Text>
            <ActionsRow
              primary={
                <Button
                  testID="passkey-create-here"
                  type="primary"
                  text={t('socialRecovery.enroll.passkey.create')}
                  disabled={busy}
                  onPress={() => create(false)}
                  hasBottomSpacing={false}
                />
              }
              secondary={
                <Button
                  testID="passkey-create-on-phone"
                  type="ghost"
                  size="small"
                  text={t('socialRecovery.enroll.passkey.createOnPhoneInstead')}
                  disabled={busy}
                  onPress={() => create(true)}
                  hasBottomSpacing={false}
                  textUnderline
                />
              }
            />
          </>
        )}
      </SectionCard>
      {served && (
        <Text fontSize={12} appearance="secondaryText">
          {t('socialRecovery.enroll.passkey.testOffered')}
        </Text>
      )}
    </View>
  )
}

export default React.memo(PasskeyCreateBlock)
