import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Route, Routes, useLocation } from 'react-router-dom'

import NoConnectionScreen from '@common/modules/no-connection/screens/NoConnectionScreen'
import routesConfig from '@common/modules/router/config/routesConfig'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { SignAccountOpControllerStateProvider } from '@web/contexts/signAccountOpControllerStateContext'
import AccountPersonalizeScreen from '@web/modules/account-personalize/screens/AccountPersonalizeScreen'
import AccountPickerScreen from '@web/modules/account-picker/screens/AccountPickerScreen'
import AccountSelectScreen from '@web/modules/account-select/screens/AccountSelectScreen'
import AddChainScreen from '@web/modules/action-requests/screens/AddChainScreen'
import BenzinScreen from '@web/modules/action-requests/screens/BenzinScreen'
import DappConnectScreen from '@web/modules/action-requests/screens/DappConnectScreen'
import GetEncryptionPublicKeyRequestScreen from '@web/modules/action-requests/screens/GetEncryptionPublicKeyRequestScreen'
import SwitchAccountScreen from '@web/modules/action-requests/screens/SwitchAccountScreen'
import WatchTokenRequestScreen from '@web/modules/action-requests/screens/WatchTokenRequestScreen'
import CreateSeedPhrasePrepareScreen from '@web/modules/auth/modules/create-seed-phrase/screens/CreateSeedPhrasePrepareScreen'
import CreateSeedPhraseWriteScreen from '@web/modules/auth/modules/create-seed-phrase/screens/CreateSeedPhraseWriteScreen'
import EmailAccountScreen from '@web/modules/auth/screens/EmailAccountScreen'
import EmailLoginScreen from '@web/modules/auth/screens/EmailLoginScreen'
import EmailRegisterScreen from '@web/modules/auth/screens/EmailRegisterScreen'
import GetStartedScreen from '@web/modules/auth/screens/GetStartedScreen'
import ImportExistingAccountSelectorScreen from '@web/modules/auth/screens/ImportExistingAccountSelectorScreen'
import ImportSmartAccountJsonScreen from '@web/modules/auth/screens/ImportSmartAccountJson'
import OnboardingCompletedScreen from '@web/modules/auth/screens/OnboardingCompletedScreen'
import PrivateKeyImportScreen from '@web/modules/auth/screens/PrivateKeyImportScreen'
import SeedPhraseImportScreen from '@web/modules/auth/screens/SeedPhraseImportScreen'
import DappCatalogScreen from '@web/modules/dapp-catalog/screens/DappCatalogScreen'
import LedgerConnectScreen from '@web/modules/hardware-wallet/screens/LedgerConnectScreen/LedgerConnectScreen'
import KeyStoreResetScreen from '@web/modules/keystore/screens/KeyStoreResetScreen/KeyStoreResetScreen'
import KeyStoreSetupScreen from '@web/modules/keystore/screens/KeyStoreSetupScreen'
import NetworksScreen from '@web/modules/networks/screens'
import AuthenticatedRoute from '@web/modules/router/components/AuthenticatedRoute'
import KeystoreUnlockedRoute from '@web/modules/router/components/KeystoreUnlockedRoute'
import NavMenu from '@web/modules/router/components/NavMenu'
import TabOnlyRoute from '@web/modules/router/components/TabOnlyRoute'
import { SettingsRoutesProvider } from '@web/modules/settings/contexts/SettingsRoutesContext'
import AboutSettingsScreen from '@web/modules/settings/screens/AboutSettingsScreen'
import AccountsSettingsScreen from '@web/modules/settings/screens/AccountsSettingsScreen'
import AddressBookSettingsScreen from '@web/modules/settings/screens/AddressBookSettingsScreen'
import DevicePasswordChangeSettingsScreen from '@web/modules/settings/screens/DevicePasswordChangeSettingsScreen'
import DevicePasswordRecoverySettingsScreen from '@web/modules/settings/screens/DevicePasswordRecoverySettingsScreen'
import DevicePasswordSetSettingsScreen from '@web/modules/settings/screens/DevicePasswordSetSettingsScreen'
import GeneralSettingsScreen from '@web/modules/settings/screens/GeneralSettingsScreen'
import ManageTokensSettingsScreen from '@web/modules/settings/screens/ManageTokensSettingsScreen'
import NetworksSettingsScreen from '@web/modules/settings/screens/NetworksSettingsScreen/NetworksSettingsScreen'
import RecoveryPhrasesSettingsScreen from '@web/modules/settings/screens/RecoveryPhrasesSettingsScreen'
import SecurityAndPrivacyScreen from '@web/modules/settings/screens/SecurityAndPrivacyScreen'
import SignedMessageHistorySettingsScreen from '@web/modules/settings/screens/SignedMessageHistorySettingsScreen'
import TermsSettingsScreen from '@web/modules/settings/screens/TermsSettingsScreen'
import TransactionHistorySettingsScreen from '@web/modules/settings/screens/TransactionHistorySettingsScreen'
import SignAccountOpScreen from '@web/modules/sign-account-op/screens/SignAccountOpScreen'
import SignMessageScreen from '@web/modules/sign-message/screens/SignMessageScreen'
import SwapAndBridgeScreen from '@web/modules/swap-and-bridge/screens/SwapAndBridgeScreen'
import TransferScreen from '@web/modules/transfer/screens/TransferScreen'
import ViewOnlyAccountAdderScreen from '@web/modules/view-only-account-adder/ViewOnlyAccountAdderScreen'
import PrivacyScreen from '@web/modules/privacy/PrivacyScreen'

const MainRoutes = () => {
  const location = useLocation()
  const { t } = useTranslation()

  useEffect(() => {
    const trimmedPathName = location.pathname.replace(/^\/|\/$/g, '')
    const routeConfig = routesConfig[trimmedPathName as keyof typeof routesConfig]
    const withTitlePrefix = routeConfig?.withTitlePrefix ?? true
    const title = `${withTitlePrefix ? 'Ambire ' : ''}${routeConfig?.name || t('Wallet')}`

    document.title = title
  }, [location.pathname, t])

  return (
    <Routes>
      <Route path={WEB_ROUTES.noConnection} element={<NoConnectionScreen />} />

      <Route element={<TabOnlyRoute />}>
        <Route path={WEB_ROUTES.keyStoreSetup} element={<KeyStoreSetupScreen />} />
        <Route path={WEB_ROUTES.keyStoreReset} element={<KeyStoreResetScreen />} />

        <Route element={<KeystoreUnlockedRoute />}>
          <Route path={WEB_ROUTES.getStarted} element={<GetStartedScreen />} />
          <Route path={WEB_ROUTES.authEmailAccount} element={<EmailAccountScreen />} />
          <Route path={WEB_ROUTES.authEmailLogin} element={<EmailLoginScreen />} />
          <Route path={WEB_ROUTES.authEmailRegister} element={<EmailRegisterScreen />} />
          <Route path={WEB_ROUTES.viewOnlyAccountAdder} element={<ViewOnlyAccountAdderScreen />} />

          <Route
            path={WEB_ROUTES.importExistingAccount}
            element={<ImportExistingAccountSelectorScreen />}
          />
          <Route path={WEB_ROUTES.ledgerConnect} element={<LedgerConnectScreen />} />

          <Route path={WEB_ROUTES.importPrivateKey} element={<PrivateKeyImportScreen />} />
          <Route path={WEB_ROUTES.importSeedPhrase} element={<SeedPhraseImportScreen />} />
          <Route
            path={WEB_ROUTES.importSmartAccountJson}
            element={<ImportSmartAccountJsonScreen />}
          />

          <Route
            path={WEB_ROUTES.createSeedPhrasePrepare}
            element={<CreateSeedPhrasePrepareScreen />}
          />
          <Route
            path={WEB_ROUTES.createSeedPhraseWrite}
            element={<CreateSeedPhraseWriteScreen />}
          />

          <Route path={WEB_ROUTES.accountPicker} element={<AccountPickerScreen />} />
          <Route path={WEB_ROUTES.accountPersonalize} element={<AccountPersonalizeScreen />} />
          <Route path={WEB_ROUTES.onboardingCompleted} element={<OnboardingCompletedScreen />} />

          <Route element={<AuthenticatedRoute />}>
            <Route element={<SettingsRoutesProvider />}>
              <Route path={WEB_ROUTES.generalSettings} element={<GeneralSettingsScreen />} />
              <Route path={WEB_ROUTES.securityAndPrivacy} element={<SecurityAndPrivacyScreen />} />
              <Route path={WEB_ROUTES.accountsSettings} element={<AccountsSettingsScreen />} />
              <Route
                path={WEB_ROUTES.recoveryPhrasesSettings}
                element={<RecoveryPhrasesSettingsScreen />}
              />
              <Route path={WEB_ROUTES.networksSettings} element={<NetworksSettingsScreen />} />
              <Route
                path={WEB_ROUTES.transactions}
                element={<TransactionHistorySettingsScreen />}
              />
              <Route
                path={WEB_ROUTES.signedMessages}
                element={<SignedMessageHistorySettingsScreen />}
              />
              <Route
                path={WEB_ROUTES.devicePasswordSet}
                element={<DevicePasswordSetSettingsScreen />}
              />
              <Route
                path={WEB_ROUTES.devicePasswordChange}
                element={<DevicePasswordChangeSettingsScreen />}
              />
              <Route
                path={WEB_ROUTES.devicePasswordRecovery}
                element={<DevicePasswordRecoverySettingsScreen />}
              />
              <Route path={WEB_ROUTES.manageTokens} element={<ManageTokensSettingsScreen />} />
              <Route path={WEB_ROUTES.addressBook} element={<AddressBookSettingsScreen />} />
              <Route path={WEB_ROUTES.settingsTerms} element={<TermsSettingsScreen />} />
              <Route path={WEB_ROUTES.settingsAbout} element={<AboutSettingsScreen />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route element={<KeystoreUnlockedRoute />}>
        <Route element={<AuthenticatedRoute />}>
          <Route path={WEB_ROUTES.transfer} element={<TransferScreen />} />
          <Route path={WEB_ROUTES.privacy} element={<PrivacyScreen />} />
          <Route path={WEB_ROUTES.topUpGasTank} element={<TransferScreen isTopUpScreen />} />
          <Route
            path={WEB_ROUTES.signAccountOp}
            element={
              <SignAccountOpControllerStateProvider>
                <SignAccountOpScreen />
              </SignAccountOpControllerStateProvider>
            }
          />
          <Route path={WEB_ROUTES.swapAndBridge} element={<SwapAndBridgeScreen />} />
          <Route path={WEB_ROUTES.signMessage} element={<SignMessageScreen />} />
          <Route path={WEB_ROUTES.benzin} element={<BenzinScreen />} />
          <Route path={WEB_ROUTES.switchAccount} element={<SwitchAccountScreen />} />

          <Route path={WEB_ROUTES.dappConnectRequest} element={<DappConnectScreen />} />
          <Route path={WEB_ROUTES.addChain} element={<AddChainScreen />} />
          <Route path={WEB_ROUTES.watchAsset} element={<WatchTokenRequestScreen />} />

          <Route
            path={WEB_ROUTES.getEncryptionPublicKeyRequest}
            element={<GetEncryptionPublicKeyRequestScreen />}
          />

          <Route path={WEB_ROUTES.menu} element={<NavMenu />} />
          <Route path={WEB_ROUTES.accountSelect} element={<AccountSelectScreen />} />
          <Route path={WEB_ROUTES.appCatalog} element={<DappCatalogScreen />} />
          <Route path={WEB_ROUTES.networks} element={<NetworksScreen />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default MainRoutes
