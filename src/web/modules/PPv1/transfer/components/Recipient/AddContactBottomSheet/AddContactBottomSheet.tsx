import React, { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import CloseIcon from '@common/assets/svg/CloseIcon'
import AddressBookContact from '@common/components/AddressBookContact'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useHover, { AnimatedPressable } from '@web/hooks/useHover'
import { getUiType } from '@web/utils/uiType'

interface Props {
  sheetRef: any
  closeBottomSheet: () => void
  address: string
}

const { isPopup } = getUiType()

const AddContactBottomSheet: FC<Props> = ({ sheetRef, closeBottomSheet, address }) => {
  const { t } = useTranslation()
  const { theme, themeType } = useTheme()
  const { addToast } = useToast()
  const { dispatch } = useBackgroundService()
  const [bindCloseBtnAnim, closeBtnAnimStyle] = useHover({ preset: 'opacityInverted' })
  const [name, setName] = useState('')

  const handleAddContact = () => {
    dispatch({
      type: 'ADDRESS_BOOK_CONTROLLER_ADD_CONTACT',
      params: {
        address,
        name
      }
    })
    closeBottomSheet()
    setName('')
    addToast(t('Contact added to Address Book'))
  }

  return (
    <BottomSheet
      id="transfer-add-contact"
      sheetRef={sheetRef}
      closeBottomSheet={closeBottomSheet}
      style={{
        ...spacings.pv0,
        ...spacings.ph0,
        overflow: 'hidden',
        width: isPopup ? '100%' : 640
      }}
      backgroundColor={themeType === THEME_TYPES.DARK ? 'secondaryBackground' : 'primaryBackground'}
    >
      <View
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          spacings.pvXl,
          spacings.phLg,
          {
            backgroundColor:
              themeType === THEME_TYPES.DARK ? theme.tertiaryBackground : theme.secondaryBackground
          }
        ]}
      >
        <Text fontSize={20} weight="medium">
          {t('Add new contact')}
        </Text>
        <AnimatedPressable
          style={[
            closeBtnAnimStyle,
            flexbox.center,
            {
              width: 40,
              height: 40
            }
          ]}
          {...bindCloseBtnAnim}
          onPress={closeBottomSheet}
        >
          <CloseIcon />
        </AnimatedPressable>
      </View>
      <View style={[spacings.phXl, spacings.ptXl, spacings.pb4Xl]}>
        <Input
          testID="form-contact-name-field"
          label={t('Name')}
          placeholder={t('Contact name')}
          onChangeText={setName}
          defaultValue={name}
          maxLength={32}
          onSubmitEditing={handleAddContact}
        />
        <Text fontSize={14} appearance="secondaryText">
          {t('Preview')}
        </Text>
        <AddressBookContact
          avatarSize={32}
          name={name || t('Give your contact a name')}
          address={address}
          isEditable={false}
        />
      </View>
      <View
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          spacings.pvXl,
          spacings.phLg,
          {
            backgroundColor:
              themeType === THEME_TYPES.DARK ? theme.tertiaryBackground : theme.secondaryBackground
          }
        ]}
      >
        <Button
          hasBottomSpacing={false}
          type="secondary"
          text={t('Cancel')}
          onPress={closeBottomSheet}
          style={{
            minWidth: 164
          }}
        />
        <Button
          testID="form-add-to-contacts-button"
          style={{
            minWidth: 240
          }}
          disabled={!address || name.length === 0 || name.length > 32}
          hasBottomSpacing={false}
          text={!name.length ? t('Name your Contact') : t('Add to Contacts')}
          onPress={handleAddContact}
        />
      </View>
    </BottomSheet>
  )
}

export default AddContactBottomSheet
