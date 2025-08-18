import { Platform } from 'react-native'

import i18n from '@common/config/localization/localization'
import { ROUTES } from '@common/modules/router/constants/common'

type RouteConfig = {
  [K in keyof typeof ROUTES]: {
    route: string
    title: string
    name: string
    /** Should the prefix 'Ambire' be prepended to the title. True by default */
    withTitlePrefix?: boolean
  }
}

const routesConfig: RouteConfig = {
  [ROUTES.keyStoreUnlock]: {
    route: ROUTES.keyStoreUnlock,
    title: Platform.select({
      default: i18n.t('Welcome Back')
    }),
    name: Platform.select({
      default: i18n.t('Welcome Back')
    })
  },
  [ROUTES.noConnection]: {
    route: ROUTES.noConnection,
    title: Platform.select({
      default: i18n.t('No Connection')
    }),
    name: Platform.select({
      default: i18n.t('No Connection')
    })
  },
  [ROUTES.getStarted]: {
    route: ROUTES.getStarted,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet'),
      web: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({
      default: i18n.t('Onboarding'),
      web: i18n.t('Onboarding')
    })
  },
  [ROUTES.importExistingAccount]: {
    route: ROUTES.importExistingAccount,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet'),
      web: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({
      default: i18n.t('Select Import Method'),
      web: i18n.t('Select Import Method')
    })
  },
  [ROUTES.ledgerConnect]: {
    route: ROUTES.ledgerConnect,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet'),
      web: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({
      default: i18n.t('Connect Ledger'),
      web: i18n.t('Connect Ledger')
    })
  },
  [ROUTES.authEmailAccount]: {
    route: ROUTES.authEmailAccount,
    title: Platform.select({
      default: i18n.t('Email Account'),
      web: i18n.t('Email Account')
    }),
    name: Platform.select({
      default: i18n.t('Email Account'),
      web: i18n.t('Email Account')
    })
  },
  [ROUTES.authEmailLogin]: {
    route: ROUTES.authEmailLogin,
    title: Platform.select({
      default: i18n.t('Email Login'),
      web: i18n.t('Email Login')
    }),
    name: Platform.select({
      default: i18n.t('Email Login'),
      web: i18n.t('Email Login')
    })
  },
  [ROUTES.authEmailRegister]: {
    route: ROUTES.authEmailRegister,
    title: Platform.select({
      default: i18n.t('Email Register'),
      web: i18n.t('Email Register')
    }),
    name: Platform.select({
      default: i18n.t('Email Register'),
      web: i18n.t('Email Register')
    })
  },
  [ROUTES.keyStoreSetup]: {
    route: ROUTES.keyStoreSetup,
    title: i18n.t('Welcome to Ambire Wallet'),
    name: i18n.t('Extension Password Setup')
  },
  [ROUTES.keyStoreReset]: {
    route: ROUTES.keyStoreReset,
    title: i18n.t('Restore Key Store Passphrase'),
    name: i18n.t('Restore Key Store Passphrase')
  },
  [ROUTES.accountPicker]: {
    route: ROUTES.accountPicker,
    title: Platform.select({
      default: i18n.t('Add Account')
    }),
    name: Platform.select({
      default: i18n.t('Add Account')
    })
  },
  [ROUTES.accountPersonalize]: {
    route: ROUTES.accountPersonalize,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({
      default: i18n.t('Account Personalization')
    })
  },
  [ROUTES.viewOnlyAccountAdder]: {
    route: ROUTES.viewOnlyAccountAdder,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({
      default: i18n.t('Watch an address')
    })
  },
  [ROUTES.dashboard]: {
    route: ROUTES.dashboard,
    title: Platform.select({
      default: i18n.t('Dashboard')
    }),
    name: Platform.select({ default: i18n.t('Dashboard') })
  },
  [ROUTES.signAccountOp]: {
    route: ROUTES.signAccountOp,
    title: Platform.select({
      default: i18n.t('Transaction Builder')
    }),
    name: Platform.select({ default: i18n.t('Transaction Builder') })
  },
  [ROUTES.transfer]: {
    route: ROUTES.transfer,
    title: Platform.select({
      default: i18n.t('Send')
    }),
    name: Platform.select({ default: i18n.t('Send') }),
    withTitlePrefix: false
  },
  [ROUTES.transactions]: {
    route: ROUTES.transactions,
    title: Platform.select({
      default: i18n.t('Transaction History')
    }),
    name: Platform.select({ default: i18n.t('Transaction History') })
  },
  [ROUTES.signMessage]: {
    route: ROUTES.signMessage,
    title: Platform.select({
      default: i18n.t('Sign Message')
    }),
    name: Platform.select({ default: i18n.t('Sign Message') })
  },
  [ROUTES.dappConnectRequest]: {
    route: ROUTES.dappConnectRequest,
    title: Platform.select({
      web: i18n.t('Webpage Wants to Connect'),
      default: i18n.t('App Wants to Connect')
    }),
    name: Platform.select({
      web: i18n.t('Webpage Wants to Connect'),
      default: i18n.t('App Wants to Connect')
    })
  },
  [ROUTES.appCatalog]: {
    route: ROUTES.appCatalog,
    title: Platform.select({
      web: i18n.t('App Catalog'),
      default: i18n.t('App Catalog')
    }),
    name: Platform.select({
      web: i18n.t('App Catalog'),
      default: i18n.t('App Catalog')
    })
  },
  [ROUTES.watchAsset]: {
    route: ROUTES.watchAsset,
    title: Platform.select({
      web: i18n.t('Webpage Wants to Add Token'),
      default: i18n.t('App Wants to Add Token')
    }),
    name: Platform.select({
      web: i18n.t('Webpage Wants to Add Token'),
      default: i18n.t('App Wants to Add Token')
    })
  },
  [ROUTES.menu]: {
    route: ROUTES.menu,
    title: Platform.select({
      web: i18n.t('Menu'),
      default: i18n.t('Side Menu')
    }),
    name: Platform.select({
      web: i18n.t('Menu'),
      default: i18n.t('Side Menu')
    })
  },
  [ROUTES.getEncryptionPublicKeyRequest]: {
    route: ROUTES.getEncryptionPublicKeyRequest,
    title: Platform.select({
      default: i18n.t('Get Encryption Public Key Request')
    }),
    name: Platform.select({
      default: i18n.t('Get Encryption Public Key Request')
    })
  },
  [ROUTES.swap]: {
    route: ROUTES.swap,
    title: Platform.select({
      default: i18n.t('Swap')
    }),
    name: Platform.select({
      default: i18n.t('Swap')
    })
  },
  [ROUTES.appCatalog]: {
    route: ROUTES.appCatalog,
    title: i18n.t('App Catalog'),
    name: i18n.t('App Catalog')
  },
  [ROUTES.accountSelect]: {
    route: ROUTES.accountSelect,
    title: Platform.select({
      default: i18n.t('Accounts')
    }),
    name: Platform.select({
      default: i18n.t('Accounts')
    })
  },
  [ROUTES.importPrivateKey]: {
    route: ROUTES.importPrivateKey,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({ default: i18n.t('Import Private Key') })
  },
  [ROUTES.importSeedPhrase]: {
    route: ROUTES.importSeedPhrase,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({ default: i18n.t('Import Recovery Phrase') })
  },
  [ROUTES.importSmartAccountJson]: {
    route: ROUTES.importSmartAccountJson,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({ default: i18n.t('Import Smart Account JSON') })
  },
  [ROUTES.createSeedPhrasePrepare]: {
    route: ROUTES.createSeedPhrasePrepare,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({ default: i18n.t('Create New Recovery Phrase') })
  },
  [ROUTES.createSeedPhraseWrite]: {
    route: ROUTES.createSeedPhraseWrite,
    title: Platform.select({
      default: i18n.t('Backup Recovery Phrase')
    }),
    name: Platform.select({ default: i18n.t('Backup Recovery Phrase') })
  },
  [ROUTES.onboardingCompleted]: {
    route: ROUTES.onboardingCompleted,
    title: Platform.select({
      default: i18n.t('Welcome to Ambire Wallet')
    }),
    name: Platform.select({ default: i18n.t('Ready To Use') })
  },
  [ROUTES.topUpGasTank]: {
    route: ROUTES.topUpGasTank,
    title: Platform.select({
      default: i18n.t('Top Up Gas Tank')
    }),
    name: Platform.select({ default: i18n.t('Top Up Gas Tank') })
  },
  [ROUTES.swapAndBridge]: {
    route: ROUTES.swapAndBridge,
    title: Platform.select({
      default: i18n.t('Swap and Bridge')
    }),
    name: Platform.select({ default: i18n.t('Swap and Bridge') }),
    withTitlePrefix: false
  },
  [ROUTES.generalSettings]: {
    route: ROUTES.generalSettings,
    title: Platform.select({
      default: i18n.t('General Settings')
    }),
    name: Platform.select({ default: i18n.t('General Settings') })
  },
  [ROUTES.securityAndPrivacy]: {
    route: ROUTES.securityAndPrivacy,
    title: Platform.select({
      default: i18n.t('Security and Privacy')
    }),
    name: Platform.select({ default: i18n.t('Security and Privacy') })
  },
  [ROUTES.accountsSettings]: {
    route: ROUTES.accountsSettings,
    title: Platform.select({
      default: i18n.t('Accounts Settings')
    }),
    name: Platform.select({ default: i18n.t('Accounts Settings') })
  },
  [ROUTES.networksSettings]: {
    route: ROUTES.networksSettings,
    title: Platform.select({ default: i18n.t('Networks') }),
    name: Platform.select({ default: i18n.t('Networks') })
  },
  [ROUTES.signedMessages]: {
    route: ROUTES.signedMessages,
    title: Platform.select({ default: i18n.t('Signed Messages History') }),
    name: Platform.select({ default: i18n.t('Signed Messages History') })
  },
  [ROUTES.devicePasswordSet]: {
    route: ROUTES.devicePasswordSet,
    title: Platform.select({ default: i18n.t('Set Extension Password') }),
    name: Platform.select({ default: i18n.t('Set Extension Password') })
  },
  [ROUTES.devicePasswordChange]: {
    route: ROUTES.devicePasswordChange,
    title: Platform.select({ default: i18n.t('Change Extension Password') }),
    name: Platform.select({ default: i18n.t('Change Extension Password') })
  },
  [ROUTES.devicePasswordRecovery]: {
    route: ROUTES.devicePasswordRecovery,
    title: Platform.select({ default: i18n.t('Recover Extension Password') }),
    name: Platform.select({ default: i18n.t('Recover Extension Password') })
  },
  [ROUTES.manageTokens]: {
    route: ROUTES.manageTokens,
    title: Platform.select({ default: i18n.t('Manage Tokens') }),
    name: Platform.select({ default: i18n.t('Manage Tokens') })
  },
  [ROUTES.addressBook]: {
    route: ROUTES.addressBook,
    title: Platform.select({ default: i18n.t('Address Book') }),
    name: Platform.select({ default: i18n.t('Address Book') })
  },
  [ROUTES.settingsTerms]: {
    route: ROUTES.settingsTerms,
    title: Platform.select({ default: i18n.t('Terms of Service') }),
    name: Platform.select({ default: i18n.t('Terms of Service') })
  },
  [ROUTES.settingsAbout]: {
    route: ROUTES.settingsAbout,
    title: Platform.select({ default: i18n.t('About') }),
    name: Platform.select({ default: i18n.t('About') })
  },
  [ROUTES.benzin]: {
    route: ROUTES.benzin,
    title: Platform.select({ default: i18n.t('Explorer') }),
    name: Platform.select({ default: i18n.t('Explorer') })
  },
  [ROUTES.switchAccount]: {
    route: ROUTES.switchAccount,
    title: Platform.select({ default: i18n.t('Switch Account') }),
    name: Platform.select({ default: i18n.t('Switch Account') })
  },
  [ROUTES.dappConnectRequest]: {
    route: ROUTES.dappConnectRequest,
    title: Platform.select({ default: i18n.t('App Connect Request') }),
    name: Platform.select({ default: i18n.t('App Connect Request') })
  },
  [ROUTES.addChain]: {
    route: ROUTES.addChain,
    title: Platform.select({ default: i18n.t('Add Chain') }),
    name: Platform.select({ default: i18n.t('Add Chain') })
  },
  [ROUTES.networks]: {
    route: ROUTES.networks,
    title: Platform.select({ default: i18n.t('Networks') }),
    name: Platform.select({ default: i18n.t('Networks') })
  }
}

export default routesConfig
