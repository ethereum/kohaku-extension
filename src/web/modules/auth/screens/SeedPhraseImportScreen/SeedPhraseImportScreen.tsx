import { wordlists } from 'bip39'
import { Mnemonic } from 'ethers'
import React, { useCallback, useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { View } from 'react-native'

import { BIP44_STANDARD_DERIVATION_TEMPLATE } from '@ambire-common/consts/derivation'
import BrushIcon from '@common/assets/svg/BrushIcon'
import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Panel from '@common/components/Panel'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import TextArea from '@common/components/TextArea'
// import Toggle from '@common/components/Toggle'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useOnboardingNavigation from '@common/modules/auth/hooks/useOnboardingNavigation'
import Header from '@common/modules/header/components/Header'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'

import getStyles from './styles'

export const CARD_WIDTH = 400

const SeedPhraseImportScreen = () => {
  const { goToPrevRoute, goToNextRoute } = useOnboardingNavigation()
  const { t } = useTranslation()

  const { theme, styles } = useTheme(getStyles)
  const { dispatch } = useBackgroundService()
  const { initParams, subType } = useAccountPickerControllerState()
  const {
    watch,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { isValid },
    unregister
  } = useForm({
    mode: 'all',
    defaultValues: { seed: '', passphrase: '' }
  })
  const [importButtonPressed, setImportButtonPressed] = useState(false)

  const [enablePassphrase] = useState(false)
  const [seedPhraseStatus, setSeedPhraseStatus] = useState<'incomplete' | 'valid' | 'invalid'>(
    'incomplete'
  )

  useEffect(() => {
    const { unsubscribe } = watch((value) => {
      if (!value.seed) {
        setSeedPhraseStatus('incomplete')
        return
      }

      const formattedSeed = value.seed.trim().split(/\s+/).join(' ')

      if (!Mnemonic.isValidMnemonic(formattedSeed)) {
        setSeedPhraseStatus('invalid')
        return
      }

      setSeedPhraseStatus('valid')
    })
    return () => unsubscribe()
  }, [watch])

  const handleFormSubmit = useCallback(async () => {
    await handleSubmit(({ seed, passphrase }) => {
      const formattedSeed = seed.trim().toLowerCase().replace(/\s+/g, ' ')
      setImportButtonPressed(true)
      dispatch({
        type: 'KEYSTORE_CONTROLLER_ADD_TEMP_SEED',
        params: {
          seed: formattedSeed,
          seedPassphrase: passphrase || null,
          hdPathTemplate: BIP44_STANDARD_DERIVATION_TEMPLATE
        }
      })
      dispatch({
        type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_PRIVATE_KEY_OR_SEED_PHRASE',
        params: { privKeyOrSeed: formattedSeed, seedPassphrase: passphrase || null }
      })
    })()
  }, [dispatch, handleSubmit])

  useEffect(() => {
    if (!getValues('seed')) return
    if (!!importButtonPressed && initParams && subType === 'seed') {
      setImportButtonPressed(false)
      goToNextRoute()
    }
  }, [goToNextRoute, dispatch, getValues, initParams, subType, importButtonPressed])

  useEffect(() => {
    if (!enablePassphrase) {
      setValue('passphrase', '')
      unregister('passphrase')
    }
  }, [enablePassphrase, setValue, unregister])

  const validateSeedPhraseWord = useCallback(
    (value: string) => {
      const formattedSeed = value.trim().toLowerCase().replace(/\s+/g, ' ')

      const couldValueBeAPastedSeed = formattedSeed.length > 1

      // If the value contains multiple words, it could be a pasted seed phrase
      // Don't display errors in this case, otherwise an error flashes when pasting
      if (!formattedSeed || couldValueBeAPastedSeed) return undefined
      if (!wordlists.english.includes(value)) return t('invalid-bip39-word')
      return undefined
    },
    [t]
  )

  return (
    <TabLayoutContainer
      backgroundColor={theme.secondaryBackground}
      header={<Header mode="custom-inner-content" withAmbireLogo />}
    >
      <TabLayoutWrapperMainContent>
        <Panel
          type="onboarding"
          spacingsSize="small"
          withBackButton
          onBackButtonPress={goToPrevRoute}
          title={t('Import recovery phrase')}
          step={1}
          totalSteps={2}
        >
          <View style={[flexbox.justifySpaceBetween, flexbox.flex1]}>
            <ScrollableWrapper>
              <Button
                testID="clear-seed-phrase-btn"
                type="ghost2"
                size="small"
                onPress={() => {
                  setValue('seed', '')
                  setSeedPhraseStatus('incomplete')
                }}
                style={[spacings.mbTy, spacings.ph0, flexbox.alignSelfEnd]}
              >
                <BrushIcon />
              </Button>
              <Controller
                control={control}
                rules={{
                  required: true,
                  validate: validateSeedPhraseWord
                }}
                name="seed"
                render={({ field: { onChange, onBlur, value } }) => {
                  const words = value.split(/(\s+)/)

                  const styledOverlay = (
                    <View style={styles.overlay}>
                      {words.map((word, index) => {
                        const isWhitespace = /^\s+$/.test(word)
                        const cleanWord = word.trim().toLowerCase()
                        const isValidWord = isWhitespace || wordlists.english.includes(cleanWord)

                        if (isWhitespace) {
                          return (
                            <Text key={`space-${String(index)}`} fontSize={14}>
                              {word}
                            </Text>
                          )
                        }

                        return (
                          <Text
                            key={`${word}-${String(index)}`}
                            fontSize={14}
                            style={{
                              color: isValidWord ? theme.primaryText : theme.errorText,
                              textDecorationLine: isValidWord ? 'none' : 'underline'
                            }}
                          >
                            {word}
                          </Text>
                        )
                      })}
                    </View>
                  )

                  return (
                    <View style={styles.textAreaWrapper}>
                      {styledOverlay}
                      <TextArea
                        testID="enter-seed-phrase-field"
                        value={value}
                        editable
                        multiline
                        numberOfLines={4}
                        autoFocus
                        onChangeText={onChange}
                        onBlur={onBlur}
                        inputWrapperStyle={{
                          position: 'relative',
                          backgroundColor: 'transparent',
                          zIndex: 2
                        }}
                        placeholder={t('Write or paste your recovery phrase')}
                        isValid={seedPhraseStatus === 'valid'}
                        error={seedPhraseStatus === 'invalid' && t('Invalid recovery phrase.')}
                        placeholderTextColor={theme.secondaryText}
                        onSubmitEditing={handleFormSubmit}
                        nativeInputStyle={{
                          color: 'rgba(0, 0, 0, 0.01)',
                          // @ts-ignore caretColor: theme.primaryText
                          caretColor: theme.primaryText
                        }}
                      />
                    </View>
                  )
                }}
              />
              {/* <Toggle
                testID="enable-passphrase-toggle"
                isOn={enablePassphrase}
                onToggle={() => setEnablePassphrase((prev) => !prev)}
                label={t('Advanced mode')}
                labelProps={{
                  fontSize: 14,
                  weight: 'regular',
                  appearance: 'secondaryText'
                }}
                style={flexbox.alignSelfStart}
              /> */}
              {enablePassphrase ? (
                <View style={styles.passphraseContainer}>
                  <Controller
                    control={control}
                    rules={{ required: enablePassphrase }}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <InputPassword
                        testID="input-passphrase"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                        placeholder="Recovery phrase passphrase"
                        containerStyle={flexbox.flex1}
                      />
                    )}
                    name="passphrase"
                  />
                </View>
              ) : null}
            </ScrollableWrapper>
            <View style={spacings.pt}>
              <Button
                testID="import-button"
                size="large"
                text={t('Confirm')}
                hasBottomSpacing={false}
                onPress={handleFormSubmit}
                disabled={!isValid || seedPhraseStatus === 'invalid'}
              />
            </View>
          </View>
        </Panel>
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

export default React.memo(SeedPhraseImportScreen)
