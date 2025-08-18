import React, { useCallback, useEffect, useRef } from 'react'
import { Animated, Pressable, View, ViewStyle } from 'react-native'

import SettingsIcon from '@common/assets/svg/SettingsIcon/SettingsIcon'
import Text from '@common/components/Text'
import { isWeb } from '@common/config/env'
import { useTranslation } from '@common/config/localization'
import useElementSize from '@common/hooks/useElementSize'
import useTheme from '@common/hooks/useTheme'
import spacings, { SPACING, SPACING_TY } from '@common/styles/spacings'
import { Portal } from '@gorhom/portal'
import useBackgroundService from '@web/hooks/useBackgroundService'
import { useCustomHover } from '@web/hooks/useHover'
import useSwapAndBridgeControllerState from '@web/hooks/useSwapAndBridgeControllerState'

import getStyles, { SETTINGS_MODAL_WIDTH } from './styles'

const SETTINGS_ICON_SIZE = 20

const RadioButton = ({
  text,
  value,
  isSelected,
  onSelect,
  containerStyle
}: {
  text: string
  value: string
  isSelected: boolean
  onSelect: (value: string) => void
  containerStyle?: ViewStyle
}) => {
  const { styles } = useTheme(getStyles)

  return (
    <Pressable style={[styles.radioContainer, containerStyle]} onPress={() => onSelect(value)}>
      {({ hovered }: any) => (
        <>
          <View
            style={[
              styles.radio,
              isSelected && styles.radioSelected,
              hovered && styles.radioHovered
            ]}
          >
            {!!isSelected && <View style={styles.radioSelectedInner} />}
          </View>
          <Text fontSize={14} weight="medium" appearance="secondaryText">
            {text}
          </Text>
        </>
      )}
    </Pressable>
  )
}

interface Props {
  handleToggleSettingsMenu: () => void
  settingModalVisible: boolean
}

const SettingsModal: React.FC<Props> = ({ handleToggleSettingsMenu, settingModalVisible }) => {
  const { t } = useTranslation()
  const { styles, theme } = useTheme(getStyles)
  const settingButtonRef: any = useRef(null)
  const settingMenuRef: any = useRef(null)
  const { routePriority } = useSwapAndBridgeControllerState()
  const { dispatch } = useBackgroundService()
  const { x: settingButtonX, y: settingButtonY } = useElementSize(settingButtonRef)
  const [bindAnim, , isHovered, , animatedValues] = useCustomHover({
    property: 'rotateZ' as any,
    values: { from: 0, to: 1 },
    duration: 350
  })

  // close menu on click outside
  useEffect(() => {
    if (!isWeb) return
    function handleClickOutside(event: MouseEvent) {
      if (!settingModalVisible) return

      if (settingMenuRef.current && !settingMenuRef.current?.contains(event.target)) {
        handleToggleSettingsMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      if (!isWeb) return
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [settingModalVisible, handleToggleSettingsMenu])

  const handleSelectPriority = useCallback(
    (value: string) => {
      dispatch({
        type: 'SWAP_AND_BRIDGE_CONTROLLER_UPDATE_FORM',
        params: { formValues: { routePriority: value as any } }
      })
    },
    [dispatch]
  )

  const rotateInterpolate = animatedValues
    ? animatedValues[0].value.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '110deg']
      })
    : null

  return (
    <>
      <View ref={settingButtonRef} testID="route-priority-sab">
        <Pressable onPress={handleToggleSettingsMenu} {...bindAnim}>
          <Animated.View style={{ transform: [{ rotateZ: rotateInterpolate || '0deg' }] }}>
            <SettingsIcon
              width={SETTINGS_ICON_SIZE}
              height={SETTINGS_ICON_SIZE}
              color={
                isHovered || settingModalVisible
                  ? theme.primaryBackgroundInverted
                  : theme.iconSecondary
              }
            />
          </Animated.View>
        </Pressable>
      </View>
      {!!settingModalVisible && (
        <Portal hostName="global">
          <View
            ref={settingMenuRef}
            style={[
              styles.settingModal,
              {
                left: settingButtonX - SETTINGS_MODAL_WIDTH + SPACING + SETTINGS_ICON_SIZE,
                top: settingButtonY + SETTINGS_ICON_SIZE + SPACING_TY
              }
            ]}
          >
            <Text fontSize={16} weight="medium" appearance="secondaryText" style={spacings.mbSm}>
              {t('Select route priority')}
            </Text>
            <RadioButton
              text={t('Highest Return')}
              value="output"
              isSelected={routePriority === 'output'}
              onSelect={handleSelectPriority}
              containerStyle={spacings.mbTy}
            />
            <RadioButton
              text={t('Fastest Transfer')}
              value="time"
              isSelected={routePriority === 'time'}
              onSelect={handleSelectPriority}
              containerStyle={spacings.mbMi}
            />
          </View>
        </Portal>
      )}
    </>
  )
}

export default React.memo(SettingsModal)
