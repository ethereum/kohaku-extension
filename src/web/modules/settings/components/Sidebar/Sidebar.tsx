import React from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
// import { SvgProps } from 'react-native-svg'

import AccountsIcon from '@common/assets/svg/AccountsIcon'
import AddressBookIcon from '@common/assets/svg/AddressBookIcon'
// import BugIcon from '@common/assets/svg/BugIcon'
// import BulbIcon from '@common/assets/svg/BulbIcon'
// import CustomTokensIcon from '@common/assets/svg/CustomTokensIcon'
// import EmailVaultIcon from '@common/assets/svg/EmailVaultIcon'
// import HelpIcon from '@common/assets/svg/HelpIcon'
import KeyStoreSettingsIcon from '@common/assets/svg/KeyStoreSettingsIcon'
import NetworksIcon from '@common/assets/svg/NetworksIcon'
// import PasswordRecoverySettingsIcon from '@common/assets/svg/PasswordRecoverySettingsIcon'
import SettingsIcon from '@common/assets/svg/SettingsIcon'
import SidebarSecurityIcon from '@common/assets/svg/SidebarSecurityIcon'
// import SignedMessageIcon from '@common/assets/svg/SignedMessageIcon'
import TransactionHistoryIcon from '@common/assets/svg/TransactionHistoryIcon'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import { ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import SettingsLink from '@web/modules/settings/components/SettingsLink'

import getStyles from './styles'

export const SETTINGS_LINKS = [
  {
    key: 'general',
    Icon: SettingsIcon,
    label: 'General',
    path: ROUTES.generalSettings
  },
  {
    key: 'accounts',
    Icon: React.memo(AccountsIcon),
    label: 'Accounts',
    path: ROUTES.accountsSettings
  },
  {
    key: 'address-book',
    Icon: React.memo(AddressBookIcon),
    label: 'Address Book',
    path: ROUTES.addressBook
  },
  {
    key: 'networks',
    Icon: React.memo(NetworksIcon),
    label: 'Networks',
    path: ROUTES.networksSettings
  },
  {
    key: 'transactions',
    Icon: React.memo(TransactionHistoryIcon),
    label: 'Transaction history',
    path: ROUTES.transactions
  },
  // {
  //   key: 'messages',
  //   Icon: React.memo(SignedMessageIcon),
  //   label: 'Signed messages',
  //   path: ROUTES.signedMessages
  // },
  {
    key: 'recovery-phrases',
    Icon: SidebarSecurityIcon,
    label: 'Recovery phrases',
    path: ROUTES.recoveryPhrasesSettings
  },
  {
    key: 'device-password-change',
    Icon: React.memo(KeyStoreSettingsIcon),
    label: 'Extension password',
    path: ROUTES.devicePasswordChange
  }
  // {
  //   key: 'device-password-recovery',
  //   Icon: React.memo(PasswordRecoverySettingsIcon),
  //   label: 'Password recovery',
  //   path: ROUTES.devicePasswordRecovery
  // }
  // {
  //   key: 'email-vault',
  //   Icon: React.memo(({ color }: SvgProps) => (
  //     <EmailVaultIcon strokeWidth={3.5} width={24} height={24} color={color} />
  //   )),
  //   label: 'Email Vault',
  //   path: '/settings/email-vault'
  // },
  // {
  //   key: 'manage-tokens',
  //   Icon: React.memo(CustomTokensIcon),
  //   label: 'Custom tokens',
  //   path: ROUTES.manageTokens
  // }
]

// const OTHER_LINKS = [
//   {
//     key: 'about',
//     Icon: BulbIcon,
//     label: 'About',
//     path: ROUTES.settingsAbout
//   },
//   {
//     key: 'help-center',
//     Icon: React.memo(HelpIcon),
//     label: 'Help Center',
//     path: 'https://help.ambire.com/hc/en-us',
//     isExternal: true
//   },
//   {
//     key: 'report-issue',
//     Icon: React.memo(BugIcon),
//     label: 'Report an issue',
//     path: 'https://help.ambire.com/hc/en-us/requests/new',
//     isExternal: true
//   }
// ]

const Sidebar = ({ activeLink }: { activeLink?: string }) => {
  const keystoreState = useKeystoreControllerState()
  const { theme, themeType, styles } = useTheme(getStyles)
  const { t } = useTranslation()

  return (
    <View style={{ ...spacings.pbLg, position: 'relative', height: '100%' }}>
      <View style={styles.settingsTitleWrapper}>
        <Text style={[spacings.ml]} fontSize={20} weight="medium">
          {t('Settings')}
        </Text>
      </View>
      <ScrollableWrapper>
        {SETTINGS_LINKS.map((_link, i) => {
          // If the KeyStore device password is not configured yet, redirect to DevicePassword->Set route under the hood,
          // instead of loading DevicePassword->Change route.
          const link =
            !keystoreState.hasPasswordSecret && _link.key === 'device-password-change'
              ? { ..._link, key: 'device-password-set', path: ROUTES.devicePasswordSet }
              : _link
          const isActive = activeLink === link.key

          return (
            <SettingsLink
              {...link}
              key={link.key}
              isActive={isActive}
              style={i === SETTINGS_LINKS.length - 1 ? spacings.mb0 : {}}
            />
          )
        })}
        <View
          style={{
            width: '100%',
            borderBottomWidth: 1,
            borderColor:
              themeType === THEME_TYPES.DARK ? theme.primaryBorder : theme.secondaryBorder,
            ...spacings.mv
          }}
        />
        {/* {OTHER_LINKS.map((link, i) => {
          const isActive = activeLink === link.key

          return (
            <SettingsLink
              {...link}
              key={link.key}
              isActive={isActive}
              style={i === OTHER_LINKS.length - 1 ? spacings.mb0 : {}}
            />
          )
        })} */}
      </ScrollableWrapper>
    </View>
  )
}

export default React.memo(Sidebar)
