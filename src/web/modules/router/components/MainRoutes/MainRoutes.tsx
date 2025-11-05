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

import PPv1HomeScreen from '@web/modules/PPv1/screens/Home'
import PPv1DepositScreen from '@web/modules/PPv1/deposit/screens/DepositScreen'
import PPv1TransferScreen from '@web/modules/PPv1/transfer/screens/TransferScreen'
import PPv1ImportScreen from '@web/modules/PPv1/importAccount/screens/ImportScreen'
import PPv1RagequitScreen from '@web/modules/PPv1/ragequit/screens/RagequitScreen'
import PPv1SettingsScreen from '@web/modules/PPv1/settings/screens/SettingsScreen'
import PPv1TokenDetailsScreen from '@web/modules/PPv1/tokenDetails/screens'

// import PPv2HomeScreen from '@web/modules/PPv2/screens/Home'
// import PPv2DepositScreen from '@web/modules/PPv2/deposit/screens/DepositScreen'
// import PPv2TransferScreen from '@web/modules/PPv2/transfer/screens/TransferScreen'
// import PPv2ImportScreen from '@web/modules/PPv2/importNote/screens/ImportScreen'

const MainRoutes = () => {
  const location = useLocation()
  const { t } = useTranslation()

  useEffect(() => {
    const trimmedPathName = location.pathname.replace(/^\/|\/$/g, '')
    const routeConfig = routesConfig[trimmedPathName as keyof typeof routesConfig]
    const withTitlePrefix = routeConfig?.withTitlePrefix ?? true
    const title = `${withTitlePrefix ? 'Kohaku ' : ''}${routeConfig?.name || t('Wallet')}`

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

          {/* Privacy Pools V1 */}
          <Route path={WEB_ROUTES.pp1Home} element={<PPv1HomeScreen />} />
          <Route path={WEB_ROUTES.pp1Deposit} element={<PPv1DepositScreen />} />
          <Route path={WEB_ROUTES.pp1Transfer} element={<PPv1TransferScreen />} />
          <Route path={WEB_ROUTES.pp1Import} element={<PPv1ImportScreen />} />
          <Route path={WEB_ROUTES.pp1Ragequit} element={<PPv1RagequitScreen />} />
          <Route path={WEB_ROUTES.pp1Settings} element={<PPv1SettingsScreen />} />
          <Route path={WEB_ROUTES.pp1TokenDetails} element={<PPv1TokenDetailsScreen />} />

          {/* Privacy Pools V2 */}
          {/* <Route path={WEB_ROUTES.pp2Home} element={<PPv2HomeScreen />} />
          <Route path={WEB_ROUTES.pp2Deposit} element={<PPv2DepositScreen />} />
          <Route path={WEB_ROUTES.pp2Transfer} element={<PPv2TransferScreen />} />
          <Route path={WEB_ROUTES.pp2Import} element={<PPv2ImportScreen />} /> */}

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
