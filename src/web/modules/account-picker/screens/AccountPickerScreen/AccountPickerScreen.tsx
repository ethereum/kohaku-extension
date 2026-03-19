import React, { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { HARDWARE_WALLET_DEVICE_NAMES } from '@ambire-common/consts/hardwareWallets'
import AccountPickerController from '@ambire-common/controllers/accountPicker/accountPicker'
import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
import Button from '@common/components/Button'
import Panel from '@common/components/Panel'
import { PanelBackButton, PanelTitle } from '@common/components/Panel/Panel'
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
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import AccountsOnPageList from '@web/modules/account-picker/components/AccountsOnPageList'
import ChangeHdPath from '@web/modules/account-picker/components/ChangeHdPath'
import useAccountPicker from '@web/modules/account-picker/hooks/useAccountPicker/useAccountPicker'

export interface Account {
  type: string
  address: string
  brandName: string
  alianName?: string
  displayBrandName?: string
  index?: number
  balance?: number
}

const AccountPickerScreen = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const accountPickerState = useAccountPickerControllerState()
  const { accounts } = useAccountsControllerState()
  const { isReady, onImportReady, setPage } = useAccountPicker()
  const { goToPrevRoute } = useOnboardingNavigation()
  const [isScanComplete, setIsScanComplete] = useState(false)

  const isLoading = useMemo(
    () =>
      accountPickerState.addAccountsStatus !== 'INITIAL' ||
      !isReady ||
      (!accountPickerState.isInitialized && !!accountPickerState.initParams),
    [
      accountPickerState.addAccountsStatus,
      isReady,
      accountPickerState.initParams,
      accountPickerState.isInitialized
    ]
  )

  const isImportDisabled = useMemo(
    () =>
      !isScanComplete ||
      isLoading ||
      accountPickerState.accountsLoading ||
      (!accountPickerState.selectedAccounts.length && !accounts.length),
    [
      isScanComplete,
      isLoading,
      accountPickerState.accountsLoading,
      accountPickerState.selectedAccounts.length,
      accounts
    ]
  )

  const shouldDisplayChangeHdPath = useMemo(
    () =>
      !!(
        accountPickerState.subType === 'seed' ||
        // TODO: Disabled for Trezor, because the flow that retrieves accounts
        // from the device as of v4.32.0 throws "forbidden key path" when
        // accessing non-"BIP44 Standard" paths. Alternatively, this could be
        // enabled in Trezor Suit (settings - safety checks), but even if enabled,
        // 1) user must explicitly allow retrieving each address (that means 25
        // clicks to retrieve accounts of the first 5 pages, blah) and 2) The
        // Trezor device shows a scarry note: "Wrong address path for selected
        // coin. Continue at your own risk!", which is pretty bad UX.
        // @ts-ignore
        ['ledger' as 'ledger', 'lattice' as 'lattice'].includes(accountPickerState.type)
      ),
    [accountPickerState.type, accountPickerState.subType]
  )

  const setTitle = useCallback(
    (keyType: AccountPickerController['type'], subType: AccountPickerController['subType']) => {
      if (keyType && keyType !== 'internal') {
        return t('Import accounts from {{ hwDeviceName }}', {
          hwDeviceName: HARDWARE_WALLET_DEVICE_NAMES[keyType]
        })
      }

      if (subType === 'seed') {
        return t('Import accounts from recovery phrase')
      }

      if (subType === 'private-key') {
        return t('Select account(s) to import')
      }

      return t('Select accounts to import')
    },
    [t]
  )

  return (
    <TabLayoutContainer
      backgroundColor={theme.secondaryBackground}
      width="lg"
      header={<Header mode="custom-inner-content" withAmbireLogo />}
    >
      <TabLayoutWrapperMainContent contentContainerStyle={[spacings.pt0]}>
        <Panel type="onboarding" spacingsSize="small" panelWidth={900} style={{ minHeight: '92%' }}>
          <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbMd]}>
            <PanelBackButton onPress={goToPrevRoute} style={spacings.mr} />
            <PanelTitle
              title={setTitle(accountPickerState.type, accountPickerState.subType)}
              style={{ textAlign: 'left', flex: 1 }}
            />
            {!!shouldDisplayChangeHdPath && (
              <ChangeHdPath
                disabled={accountPickerState.accountsLoading || !!isLoading}
                setPage={setPage}
              />
            )}
          </View>

          <AccountsOnPageList
            state={accountPickerState}
            setPage={setPage}
            subType={accountPickerState.subType}
            isLoading={isLoading}
            isScanComplete={isScanComplete}
            onScanComplete={() => setIsScanComplete(true)}
          >
            <Button
              testID="button-import-account"
              hasBottomSpacing={false}
              onPress={onImportReady}
              size="large"
              disabled={isImportDisabled}
              text={
                isLoading || !isScanComplete
                  ? t('Importing...')
                  : !accountPickerState.selectedAccounts.length
                  ? t('Continue')
                  : t('Import accounts')
              }
            >
              <RightArrowIcon style={spacings.ml} />
            </Button>
          </AccountsOnPageList>
        </Panel>
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

export default React.memo(AccountPickerScreen)
