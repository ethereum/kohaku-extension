/* eslint-disable prettier/prettier */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { Pressable, ScrollView, View } from 'react-native'

import { Account } from '@ambire-common/interfaces/account'
import wait from '@ambire-common/utils/wait'
import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Panel from '@common/components/Panel'
import SuccessAnimation from '@common/components/SuccessAnimation'
import Text from '@common/components/Text'
import { Trans, useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import useOnboardingNavigation from '@common/modules/auth/hooks/useOnboardingNavigation'
import Header from '@common/modules/header/components/Header'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import { createTab } from '@web/extension-services/background/webapi/tab'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useWalletStateController from '@web/hooks/useWalletStateController'
import AccountPersonalizeCard from '@web/modules/account-personalize/components/AccountPersonalizeCard'
import AccountsLoadingAnimation from '@web/modules/account-personalize/components/AccountsLoadingAnimation'
import AccountsLoadingDotsAnimation from '@web/modules/account-personalize/components/AccountsLoadingDotsAnimation'
import PinExtension from '@web/modules/auth/components/PinExtension'

import getStyles from './styles'

export const CARD_WIDTH = 400

const AccountPersonalizeScreen = () => {
  const { t } = useTranslation()
  const { goToNextRoute, goToPrevRoute, setAccountsToPersonalize, accountsToPersonalize } =
    useOnboardingNavigation()
  const { theme } = useTheme(getStyles)
  const { dispatch } = useBackgroundService()
  const accountPickerState = useAccountPickerControllerState()
  const accountsState = useAccountsControllerState()
  const { accounts } = useAccountsControllerState()
  const { isSetupComplete } = useWalletStateController()
  const { addToast } = useToast()
  const initPassed = useRef(false)
  const newlyAddedAccounts = useMemo(() => accounts.filter((a) => a.newlyAdded) || [], [accounts])

  const { handleSubmit, control, setValue, getValues } = useForm({
    defaultValues: {
      accounts: accountPickerState.addedAccountsFromCurrentSession || newlyAddedAccounts
    }
  })

  // Remains in loading state until `accountsToPersonalize` are loaded
  const [isLoading, setIsLoading] = useState(true)
  // Enters into completed state after the `Complete` button is pressed
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    if (!accountPickerState.initParams) return
    if (accountPickerState.isInitialized) return
    if (initPassed.current && !completed) return

    dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT' })
    if (!isLoading) setIsLoading(true)
    if (completed) setCompleted(false)
    if (accountsToPersonalize.length) setAccountsToPersonalize([])
    initPassed.current = true
  }, [
    isLoading,
    dispatch,
    accountPickerState.isInitialized,
    accountPickerState.initParams,
    completed,
    accountsToPersonalize,
    setAccountsToPersonalize
  ])

  useEffect(() => {
    if (
      !accountPickerState.initParams &&
      !accountPickerState.isInitialized &&
      accountsToPersonalize.length &&
      !newlyAddedAccounts.length &&
      !completed
    ) {
      setCompleted(true)
      initPassed.current = false
    }
  }, [
    accountPickerState.initParams,
    accountPickerState.isInitialized,
    accountsToPersonalize.length,
    completed,
    newlyAddedAccounts.length,
    goToNextRoute,
    isSetupComplete
  ])

  useEffect(() => {
    if (!isSetupComplete && !!completed) goToNextRoute()
  }, [completed, goToNextRoute, isSetupComplete])

  // hold the loading state for 1.1 seconds before displaying the accountsToPersonalize for better UX
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ;(async () => {
      await wait(1100)

      if (
        accountPickerState.isInitialized &&
        accountPickerState.selectNextAccountStatus === 'INITIAL' &&
        !accountPickerState.selectedAccountsFromCurrentSession.length &&
        accountPickerState.addAccountsStatus === 'INITIAL'
      ) {
        setIsLoading(false)
      }

      if (
        !accountPickerState.initParams &&
        !accountPickerState.isInitialized &&
        accountsToPersonalize.length
      ) {
        setIsLoading(false)
      }

      // this covers the case when the screen is opened via the browser navigation instead of the internal
      // navigation. After 1.1 sec the loading state will be set to false and the hook below will be triggered
      // that will navigate the user to the dashboard screen because there will be no accounts to personalize
      if (
        !accountPickerState.initParams &&
        !accountPickerState.isInitialized &&
        accountsState.statuses.addAccounts === 'INITIAL'
      ) {
        setIsLoading(false)
      }
    })()
  }, [
    accountPickerState.initParams,
    accountPickerState.isInitialized,
    accountPickerState.readyToRemoveAccounts.length,
    accountPickerState.selectNextAccountStatus,
    accountPickerState.selectedAccountsFromCurrentSession.length,
    accountsToPersonalize,
    accountPickerState.addAccountsStatus,
    accountsState.statuses.addAccounts
  ])

  // the hook inits the list with accountsToPersonalize
  useEffect(() => {
    if (isLoading || accountsToPersonalize.length) return

    let state: Account[] = []
    if (accountPickerState.isInitialized) {
      state = accountPickerState.addedAccountsFromCurrentSession
    }

    if (!accountPickerState.isInitialized && newlyAddedAccounts.length) {
      state = newlyAddedAccounts
    }

    if (state.length) {
      setAccountsToPersonalize(state)
    } else {
      goToNextRoute()
    }
  }, [
    isLoading,
    accountPickerState.isInitialized,
    accountPickerState.addedAccountsFromCurrentSession,
    accountsToPersonalize.length,
    newlyAddedAccounts,
    accountsState.statuses.addAccounts,
    setAccountsToPersonalize,
    goToNextRoute
  ])

  // Generate privacy pool v1 secrets when accounts are loaded
  useEffect(() => {
    if (!isLoading && accountsToPersonalize.length && !completed) {
      dispatch({ type: 'PRIVACY_POOLS_CONTROLLER_GENERATE_PPV1_KEYS' })
    }
  }, [isLoading, accountsToPersonalize.length, completed, dispatch])

  // prevents showing accounts to personalize from prev sessions
  useEffect(() => {
    if (newlyAddedAccounts.length && accountPickerState.isInitialized) {
      dispatch({ type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE' })
    }
  }, [newlyAddedAccounts.length, accountPickerState.isInitialized, dispatch])

  useEffect(() => {
    setValue('accounts', accountsToPersonalize)
  }, [accountsToPersonalize, setValue])

  const { fields } = useFieldArray({ control, name: 'accounts' })

  const handleSave = useCallback(
    (data?: { accounts: Account[] }) => {
      const newAccounts = data?.accounts || getValues('accounts')
      dispatch({
        type: 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_PREFERENCES',
        params: newAccounts.map((a) => ({ addr: a.addr, preferences: a.preferences }))
      })
    },
    [dispatch, getValues]
  )

  useEffect(() => {
    const handleBeforeUnload = () => handleSave()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [handleSave])

  const handleComplete = useCallback(async () => {
    await handleSubmit(handleSave)()
    dispatch({ type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE' })
    if (isSetupComplete) {
      initPassed.current = false
      dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET' })
    } else {
      setCompleted(true)
    }
  }, [isSetupComplete, dispatch, handleSave, handleSubmit])

  const handleContactSupport = useCallback(async () => {
    try {
      await createTab('https://help.ambire.com/hc/en-us/requests/new')
    } catch {
      addToast("Couldn't open link", { type: 'error' })
    }
  }, [addToast])

  return (
    <>
      {!!completed && !isLoading && <PinExtension />}
      <TabLayoutContainer
        backgroundColor={theme.secondaryBackground}
        header={<Header mode="custom-inner-content" withAmbireLogo={!completed} />}
      >
        <TabLayoutWrapperMainContent>
          <Panel
            type="onboarding"
            spacingsSize="small"
            style={!accountPickerState.pageError && spacings.ptMd}
            withBackButton={!!accountPickerState.pageError}
            onBackButtonPress={() => {
              goToPrevRoute()
            }}
            title={accountPickerState.pageError ? t('Accounts') : undefined}
          >
            {isLoading && !accountPickerState.pageError ? (
              <View style={[flexbox.alignCenter]}>
                <View style={spacings.mbLg}>
                  <AccountsLoadingAnimation />
                </View>
                <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                  <View style={flexbox.flex1} />
                  <Text fontSize={20} weight="semiBold" style={[text.center, spacings.phMi]}>
                    {t('Loading accounts')}
                  </Text>
                  <View style={[flexbox.flex1, flexbox.justifyEnd, { height: '75%' }]}>
                    <AccountsLoadingDotsAnimation />
                  </View>
                </View>
              </View>
            ) : accountPickerState.pageError ? (
              <View style={flexbox.alignCenter}>
                <Alert
                  type="warning"
                  title={accountPickerState.pageError}
                  text={
                    <Trans>
                      <Alert.Text type="warning">
                        Please go back and start the account-adding process again. If the problem
                        persists, please{' '}
                        <Pressable onPress={handleContactSupport}>
                          <Alert.Text type="warning" style={text.underline}>
                            contact our support team
                          </Alert.Text>
                        </Pressable>
                        .
                      </Alert.Text>
                    </Trans>
                  }
                />
              </View>
            ) : (
              <>
                <SuccessAnimation
                  noBackgroundShapes
                  width={352}
                  height={156}
                  style={{ ...spacings.pv0, ...spacings.ph0, ...spacings.mbXl }}
                  animationContainerStyle={{ width: 200, height: 140 }}
                >
                  <Text weight="semiBold" fontSize={20} style={spacings.mtSm}>
                    {t('Added successfully')}
                  </Text>
                </SuccessAnimation>
                <ScrollView style={spacings.mbLg}>
                  {accountsToPersonalize.map((acc, index) => (
                    <AccountPersonalizeCard
                      key={acc.addr + completed}
                      control={control}
                      index={index}
                      account={acc}
                      hasBottomSpacing={index !== fields.length - 1}
                      onSave={handleSave as any}
                      disableEdit={!!completed}
                    />
                  ))}
                </ScrollView>
                {completed ? (
                  <Text appearance="secondaryText" weight="medium" style={[text.center]}>
                    {t('You can access your accounts from the dashboard via the extension icon.')}
                  </Text>
                ) : (
                  <Button
                    testID="button-save-and-continue"
                    size="large"
                    onPress={handleComplete}
                    hasBottomSpacing={false}
                    text={t('Complete')}
                    disabled={!accounts.length}
                  />
                )}
                {/* {!completed && ['seed', 'hw'].includes(accountPickerState.subType as any) && (
                  <View style={spacings.ptLg}>
                    <Button
                      testID="add-more-accounts-btn"
                      type="ghost"
                      text={t('Add more accounts from this {{source}}', {
                        source:
                          accountPickerState.subType === 'hw'
                            ? 'hardware wallet'
                            : 'recovery phrase'
                      })}
                      onPress={() => {
                        handleSave()
                        goToNextRoute(WEB_ROUTES.accountPicker)
                      }}
                      textStyle={{ fontSize: 14, color: theme.primary, letterSpacing: -0.1 }}
                      style={{ ...spacings.ph0, height: 22 }}
                      hasBottomSpacing={false}
                      childrenPosition="left"
                    >
                      <Text
                        fontSize={24}
                        weight="light"
                        style={spacings.mrTy}
                        color={theme.primary}
                      >
                        +
                      </Text>
                    </Button>
                  </View>
                )} */}
              </>
            )}
          </Panel>
        </TabLayoutWrapperMainContent>
      </TabLayoutContainer>
    </>
  )
}

export default React.memo(AccountPersonalizeScreen)
