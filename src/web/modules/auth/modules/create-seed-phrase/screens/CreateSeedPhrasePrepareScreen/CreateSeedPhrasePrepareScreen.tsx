import React, { useCallback, useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'

import { BIP44_STANDARD_DERIVATION_TEMPLATE } from '@ambire-common/consts/derivation'
import { KeystoreSeed } from '@ambire-common/interfaces/keystore'
import { EntropyGenerator } from '@ambire-common/libs/entropyGenerator/entropyGenerator'
import Button from '@common/components/Button'
import Checkbox from '@common/components/Checkbox'
import Panel from '@common/components/Panel'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useExtraEntropy from '@common/hooks/useExtraEntropy'
import useTheme from '@common/hooks/useTheme'
import useOnboardingNavigation from '@common/modules/auth/hooks/useOnboardingNavigation'
import Header from '@common/modules/header/components/Header'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import Divider from '@common/components/Divider'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import eventBus from '@web/extension-services/event/eventBus'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'

const CHECKBOXES = [
  {
    id: 0,
    label: 'Your recovery phrase is private. Keep it safe and never share it.'
  },
  {
    id: 1,
    label: 'If your recovery phrase is at risk, so is your account.'
  },
  {
    id: 2,
    label: 'Use your recovery phrase only to access or recover your wallet.'
  }
]

const CreateSeedPhrasePrepareScreen = () => {
  const { goToNextRoute, goToPrevRoute } = useOnboardingNavigation()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [checkboxesState, setCheckboxesState] = useState([false, false, false])
  const allCheckboxesChecked = checkboxesState.every((checkbox) => checkbox)
  const { hasTempSeed } = useKeystoreControllerState()
  const [initTempSeed, setInitTempSeed] = useState<KeystoreSeed | null>(null)

  const { dispatch } = useBackgroundService()

  const { getExtraEntropy } = useExtraEntropy()

  useEffect(() => {
    dispatch({ type: 'KEYSTORE_CONTROLLER_SEND_TEMP_SEED_TO_UI' })
  }, [dispatch])

  useEffect(() => {
    const onReceiveOneTimeData = (data: any) => {
      if (!data.tempSeed) return

      setInitTempSeed(data.tempSeed)
    }

    eventBus.addEventListener('receiveOneTimeData', onReceiveOneTimeData)

    return () => eventBus.removeEventListener('receiveOneTimeData', onReceiveOneTimeData)
  }, [])

  const handleSubmit = useCallback(() => {
    if (hasTempSeed && (!initTempSeed || initTempSeed.seed.split(' ').length === 12)) {
      goToNextRoute(WEB_ROUTES.createSeedPhraseWrite)
      return
    }

    const entropyGenerator = new EntropyGenerator()
    const seed = entropyGenerator.generateRandomMnemonic(12, getExtraEntropy()).phrase

    dispatch({
      type: 'KEYSTORE_CONTROLLER_ADD_TEMP_SEED',
      params: { seed, hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE }
    })

    goToNextRoute(WEB_ROUTES.createSeedPhraseWrite)
  }, [getExtraEntropy, goToNextRoute, dispatch, hasTempSeed, initTempSeed])

  const handleCheckboxPress = (id: number) => {
    setCheckboxesState((prevState) => {
      const newState = [...prevState]
      newState[id] = !prevState[id]
      return newState
    })
  }

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
          innerStyle={[{ padding: 0, maxWidth: 'none' }]}
          type="onboarding"
          spacingsSize="small"
          step={1}
          totalSteps={2}
          // title="Create new recovery phrase"
          // withBackButton={false}
          showProgress={false}
          onBackButtonPress={goToPrevRoute}
        >
          <Text
            weight="number_bold"
            appearance="muted"
            fontSize={20}
            style={[spacings.mbTy, { color: theme.textPrimary }]}
          >
            {t('Create new recovery phrase')}
          </Text>
          <Text weight="medium" appearance="muted" fontSize={13}>
            {t('Before you begin, check these security tips.')}
          </Text>

          <Divider style={{ marginTop: 10, marginBottom: 20 }} />

          <ScrollableWrapper style={flexbox.flex1} contentContainerStyle={{ flexGrow: 1 }}>
            {CHECKBOXES.map(({ id, label }, index) => (
              <View
                key={id}
                style={[
                  spacings.pvSm,
                  spacings.ph,
                  flexbox.directionRow,
                  flexbox.justifyStart,
                  spacings.mbSm,
                  {
                    backgroundColor: `${theme.surfaceInput.toString()}a8`,
                    borderRadius: BORDER_RADIUS_PRIMARY,
                    borderColor: `${theme.accent.toString()}26`
                  }
                ]}
              >
                <Checkbox
                  style={[spacings.mb0]}
                  value={checkboxesState[id]}
                  onValueChange={() => {
                    handleCheckboxPress(id)
                  }}
                />
                <Pressable
                  testID={`create-seed-prepare-checkbox-${index}`}
                  style={flexbox.flex1}
                  onPress={() => handleCheckboxPress(id)}
                >
                  <Text appearance="secondaryText" fontSize={14}>
                    {t(label)}
                  </Text>
                </Pressable>
              </View>
            ))}
          </ScrollableWrapper>
          <View style={spacings.pt}>
            <Button
              testID="review-seed-phrase-btn"
              disabled={!allCheckboxesChecked}
              accessibilityRole="button"
              size="large"
              text={t('Create recovery phrase')}
              hasBottomSpacing={false}
              onPress={handleSubmit}
            />
            <Button
              testID="review-seed-phrase-back-btn"
              accessibilityRole="button"
              size="large"
              text={t('Back')}
              hasBottomSpacing={false}
              onPress={goToPrevRoute}
              style={[spacings.mtSm, { borderColor: '#F9F6E940' }]}
              type="outline"
            />
          </View>
        </Panel>
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

export default React.memo(CreateSeedPhrasePrepareScreen)
