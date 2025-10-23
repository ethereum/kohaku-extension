// common routes between the mobile app and the extension(web)
const COMMON_ROUTES = {
  // TODO: move here the common routes between the mobile app and the extension
}

const MOBILE_ROUTES = {
  ...COMMON_ROUTES
  // TODO: add here mobile only routes
}

const WEB_ROUTES = {
  ...COMMON_ROUTES,
  keyStoreUnlock: 'keystore-unlock',
  getStarted: 'get-started',
  accountPicker: 'account-picker',
  dashboard: 'dashboard',
  earn: 'earn',
  transfer: 'transfer',
  topUpGasTank: 'top-up-gas-tank',
  signAccountOp: 'sign-account-op',
  transactions: 'transactions',
  signedMessages: 'signed-messages',
  signMessage: 'sign-message',
  menu: 'menu',
  swap: 'swap',
  noConnection: 'no-connection',
  accounts: 'accounts',
  appCatalog: 'app-catalog',
  keyStoreSetup: 'keystore-setup',
  keyStoreReset: 'keystore-reset',
  getEncryptionPublicKeyRequest: 'get-encryption-public-key-request',
  dappConnectRequest: 'dapp-connect-request',
  watchAsset: 'watch-asset',
  addChain: 'add-chain',
  switchAccount: 'switch-account',
  authEmailAccount: 'auth-email-account',
  authEmailLogin: 'auth-email-login',
  authEmailRegister: 'auth-email-register',
  accountPersonalize: 'account-personalize',
  accountSelect: 'account-select',
  viewOnlyAccountAdder: 'view-only-account-adder',
  networks: 'networks',
  generalSettings: 'settings/general',
  settingsTerms: 'settings/terms',
  settingsAbout: 'settings/about',
  networksSettings: 'settings/networks',
  accountsSettings: 'settings/accounts',
  devicePasswordSet: 'settings/device-password-set',
  devicePasswordChange: 'settings/device-password-change',
  devicePasswordRecovery: 'settings/device-password-recovery',
  addressBook: 'settings/address-book',
  manageTokens: 'settings/manage-tokens',
  importPrivateKey: 'import-private-key',
  importSmartAccountJson: 'import-smart-account-json',
  importSeedPhrase: 'import-recovery-phrase',
  importExistingAccount: 'import-existing-account',
  createSeedPhrasePrepare: 'create-new-recovery-phrase',
  createSeedPhraseWrite: 'backup-recovery-phrase',
  ledgerConnect: 'ledger-connect',
  benzin: 'benzin',
  swapAndBridge: 'swap-and-bridge',
  recoveryPhrasesSettings: 'settings/recovery-phrases',
  securityAndPrivacy: 'settings/security-and-privacy',
  onboardingCompleted: 'wallet-setup-completed',

  // Privacy Pools V1 routes
  pp1Home: 'PPv1Home',
  pp1Deposit: 'PPv1Deposit',
  pp1Transfer: 'PPv1Transfer',
  pp1Import: 'PPv1Import',
  pp1Ragequit: 'PPv1Ragequit',
  pp1Settings: 'PPv1Settings',
  pp1TokenDetails: 'PPv1TokenDetails',

  // Privacy Pools V2 routes
  pp2Home: 'PPv2Home',
  pp2Deposit: 'PPv2Deposit',
  pp2Transfer: 'PPv2Transfer',
  pp2Import: 'PPv2Import'
}

const ROUTES = { ...MOBILE_ROUTES, ...WEB_ROUTES }

const ONBOARDING_WEB_ROUTES = [
  WEB_ROUTES.getStarted,
  WEB_ROUTES.createSeedPhrasePrepare,
  WEB_ROUTES.createSeedPhraseWrite,
  WEB_ROUTES.importExistingAccount,
  WEB_ROUTES.importPrivateKey,
  WEB_ROUTES.importSeedPhrase,
  WEB_ROUTES.importSmartAccountJson,
  WEB_ROUTES.viewOnlyAccountAdder,
  WEB_ROUTES.ledgerConnect,
  WEB_ROUTES.keyStoreSetup,
  WEB_ROUTES.accountPersonalize,
  WEB_ROUTES.accountPicker,
  WEB_ROUTES.onboardingCompleted
] as const

export { MOBILE_ROUTES, ONBOARDING_WEB_ROUTES, ROUTES, WEB_ROUTES }
