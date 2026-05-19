import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import { KeystoreSeed } from '@ambire-common/interfaces/keystore'
import CopyIcon from '@common/assets/svg/CopyIcon'
import Button from '@common/components/Button'
import Panel from '@common/components/Panel'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import useOnboardingNavigation from '@common/modules/auth/hooks/useOnboardingNavigation'
import Header from '@common/modules/header/components/Header'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import Divider from '@common/components/Divider'
import { setStringAsync } from '@common/utils/clipboard'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import eventBus from '@web/extension-services/event/eventBus'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'

const CreateSeedPhraseWriteScreen = () => {
  const { goToNextRoute, goToPrevRoute } = useOnboardingNavigation()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { addToast } = useToast()
  const { dispatch } = useBackgroundService()
  const { hasTempSeed } = useKeystoreControllerState()
  const [tempSeed, setTempSeed] = useState<KeystoreSeed | null>(null)
  const { initParams, subType } = useAccountPickerControllerState()
  const [submitButtonPressed, setSubmitButtonPressed] = useState(false)

  useEffect(() => {
    if (!tempSeed && hasTempSeed) {
      dispatch({ type: 'KEYSTORE_CONTROLLER_SEND_TEMP_SEED_TO_UI' })
    }
  }, [dispatch, tempSeed, hasTempSeed])

  useEffect(() => {
    const onReceiveOneTimeData = (data: any) => {
      if (!data.tempSeed) return

      setTempSeed(data.tempSeed)
    }

    eventBus.addEventListener('receiveOneTimeData', onReceiveOneTimeData)

    return () => eventBus.removeEventListener('receiveOneTimeData', onReceiveOneTimeData)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!tempSeed) return

    setSubmitButtonPressed(true)
    dispatch({
      type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_PRIVATE_KEY_OR_SEED_PHRASE',
      params: { privKeyOrSeed: tempSeed.seed, hdPathTemplate: tempSeed.hdPathTemplate }
    })
  }, [dispatch, tempSeed])

  useEffect(() => {
    if (!tempSeed) return
    if (!!submitButtonPressed && initParams && subType === 'seed') {
      setSubmitButtonPressed(false)
      goToNextRoute()
    }
  }, [goToNextRoute, dispatch, tempSeed, initParams, submitButtonPressed, subType])

  const handleCopyToClipboard = useCallback(async () => {
    try {
      if (!tempSeed) return

      await setStringAsync(tempSeed.seed)
      addToast(t('Recovery phrase copied to clipboard'))
    } catch {
      addToast(t('Failed to copy recovery phrase'))
    }
  }, [addToast, tempSeed, t])

  const seedArray = useMemo(() => {
    if (!tempSeed) return []

    return tempSeed.seed.split(' ')
  }, [tempSeed])

  return (
    <TabLayoutContainer
      backgroundColor={theme.secondaryBackground}
      header={<Header mode="custom-inner-content" withAmbireLogo />}
      style={{ ...flexbox.center, height: '100%' }}
    >
      <TabLayoutWrapperMainContent contentContainerStyle={{ margin: 'auto', height: 'auto' }}>
        <Panel
          style={[
            flexbox.alignStart,
            {
              minHeight: 0
            }
          ]}
          type="onboarding"
          spacingsSize="small"
          step={2}
          totalSteps={2}
          showProgress={false}
          onBackButtonPress={() => {
            goToPrevRoute()
          }}
        >
          {!!seedArray.length && (
            <>
              <Text
                weight="number_bold"
                appearance="muted"
                fontSize={20}
                style={[spacings.mbTy, { color: theme.textPrimary }]}
              >
                {t('Back up recovery phrase')}
              </Text>
              <Text weight="medium" appearance="muted" fontSize={13} style={[spacings.mbTy]}>
                {t('Write down and secure the recovery phrase for your account.')}
              </Text>

              <Divider style={{ marginTop: 10, marginBottom: 20 }} />

              <ScrollableWrapper
                style={flexbox.flex1}
                contentContainerStyle={{
                  ...flexbox.directionRow,
                  ...flexbox.wrap,
                  ...flexbox.justifyCenter,
                  borderWidth: 1,
                  borderColor: theme.secondaryBorder,
                  ...common.borderRadiusPrimary
                }}
              >
                {seedArray.map((word, index) => (
                  <View
                    key={`${word}-${index.toString()}`}
                    style={{
                      width: '33.33%',
                      borderRightWidth: (index + 1) % 3 === 0 ? 0 : 1,
                      borderBottomWidth: index < 9 ? 1 : 0,
                      borderColor: theme.secondaryBorder,
                      ...spacings.ptMi,
                      ...spacings.pbMi,
                      ...spacings.phMi,
                      ...flexbox.alignCenter,
                      ...flexbox.justifyCenter
                    }}
                  >
                    <View style={[flexbox.directionRow, flexbox.alignCenter, { width: '100%' }]}>
                      <Text
                        fontSize={12}
                        appearance="tertiaryText"
                        weight="medium"
                        style={{ lineHeight: 11 }}
                      >
                        {index + 1}.
                      </Text>
                    </View>
                    <Text fontSize={14} weight="medium" style={{ lineHeight: 19 }}>
                      {word}
                    </Text>
                    <Text fontSize={12} style={{ lineHeight: 11 }}>
                      {' '}
                    </Text>
                  </View>
                ))}
              </ScrollableWrapper>

              <View
                style={[
                  flexbox.directionRow,
                  flexbox.justifyCenter,
                  flexbox.alignCenter,
                  spacings.ptTy,
                  common.borderRadiusPrimary
                  // spacings.mbLg
                ]}
              >
                <Button
                  type="ghost"
                  text={t('Copy recovery phrase')}
                  hasBottomSpacing={false}
                  size="small"
                  testID="copy-recovery-phrase"
                  onPress={handleCopyToClipboard}
                >
                  <CopyIcon style={spacings.mlTy} />
                </Button>
              </View>

              <Divider style={{ marginTop: 10, marginBottom: 20 }} />

              <Button
                testID="create-seed-phrase-write-continue-btn"
                accessibilityRole="button"
                text={t("I've saved the phrase")}
                size="large"
                hasBottomSpacing={false}
                onPress={handleSubmit}
              />
              <Button
                testID="create-seed-phrase-write-back-btn"
                accessibilityRole="button"
                text={t('Back')}
                size="large"
                hasBottomSpacing={false}
                onPress={goToPrevRoute}
                style={[spacings.mtSm, { borderColor: '#F9F6E940' }]}
                type="outline"
              />
            </>
          )}
          {!seedArray.length && (
            <View style={[flexbox.flex1, flexbox.alignCenter, flexbox.justifyCenter]}>
              <Spinner style={{ width: 16, height: 16 }} />
            </View>
          )}
        </Panel>
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

export default CreateSeedPhraseWriteScreen
