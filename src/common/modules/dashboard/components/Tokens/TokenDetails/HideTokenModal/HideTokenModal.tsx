import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import Checkbox from '@common/components/Checkbox'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'

import getStyles from './styles'

const HideTokenModal = ({
  handleClose,
  handleHideToken,
  modalRef
}: {
  handleClose: () => void
  handleHideToken: (doNotShowModalAgain: boolean) => Promise<void>
  modalRef: any
}) => {
  const { styles, theme, themeType } = useTheme(getStyles)
  const [doNotShowModalAgain, setDoNotShowModalAgain] = useState(false)
  const { addToast } = useToast()
  const { t } = useTranslation()

  return (
    <BottomSheet
      sheetRef={modalRef}
      // id="confirm-password-bottom-sheet"
      type="modal"
      backgroundColor={themeType === THEME_TYPES.DARK ? 'secondaryBackground' : 'primaryBackground'}
      closeBottomSheet={handleClose}
      scrollViewProps={{ contentContainerStyle: { flex: 1 } }}
      containerInnerWrapperStyles={{ flex: 1 }}
      style={styles.modal}
    >
      <Text style={spacings.mbSm} weight="semiBold">
        {t('Are you sure you want to hide this token?')}
      </Text>
      <Text>{t('You can always unhide it from the Settings menu > Custom tokens.')}</Text>

      <Pressable
        onPress={() => setDoNotShowModalAgain(!doNotShowModalAgain)}
        style={[spacings.mt2Xl, { flexDirection: 'row', alignSelf: 'flex-start' }]}
      >
        <Checkbox onValueChange={() => {}} value={doNotShowModalAgain} />
        <Text style={{ color: theme.secondaryText }}>{t("Don't ask me again")}</Text>
      </Pressable>

      <View
        style={[
          spacings.mtLg,
          {
            flexDirection: 'row',
            justifyContent: 'space-between'
          }
        ]}
      >
        <Button text={t('Cancel')} type="secondary" onPress={handleClose} />
        <Button
          type="primary"
          text={t('Yes, hide it!')}
          onPress={() => {
            handleHideToken(doNotShowModalAgain).catch(() =>
              addToast('Failed to hide token. Please refresh and try again.', { type: 'error' })
            )
          }}
        />
      </View>
    </BottomSheet>
  )
}

export default React.memo(HideTokenModal)
