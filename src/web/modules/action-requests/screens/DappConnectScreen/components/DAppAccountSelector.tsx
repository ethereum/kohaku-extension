import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { Account as AccountInterface } from '@ambire-common/interfaces/account'
import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import Account from '@web/modules/account-select/components/Account'
import { ScreenMode } from './interface'

interface Props {
  setSelectedAccount: React.Dispatch<
    React.SetStateAction<{
      isNew: boolean
      address: string
    } | null>
  >
  setScreenMode: React.Dispatch<React.SetStateAction<ScreenMode>>
  origin?: string
}

interface AccountGroup {
  label: string
  seedId?: string
  accounts: AccountInterface[]
}

const AccountOption: FC<{
  account: AccountInterface
  onSelect: () => void
}> = ({ account, onSelect }) => {
  return (
    <Account
      account={account}
      withSettings={false}
      withKeyType={false}
      onSelect={() => onSelect()}
      maxAccountAddrLength={30}
    />
  )
}

type ViewMode = 'buttons' | 'dapp-accounts' | 'all-accounts'

const AccountSelector: FC<{
  setSelectedAccount: React.Dispatch<
    React.SetStateAction<{
      isNew: boolean
      address: string
    } | null>
  >
  dappId?: string
  setScreenMode: React.Dispatch<React.SetStateAction<ScreenMode>>
}> = ({ setSelectedAccount, setScreenMode, dappId }) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const { accounts } = useAccountsControllerState()
  const { keys, seeds } = useKeystoreControllerState()

  const [viewMode, setViewMode] = React.useState<ViewMode>('buttons')

  // Get dapp-specific accounts
  const dappAccounts = useMemo(() => {
    if (!dappId) return []

    return accounts.filter((acc) => acc.associatedDappIDs?.includes(dappId)) || []
  }, [accounts, dappId])

  // Group all accounts by seed/key
  const groupedAccounts = useMemo(() => {
    const accountGroups: AccountGroup[] = []

    accounts.forEach((acc) => {
      const associatedKeys = acc.associatedKeys
      const key = keys.find((k) => associatedKeys.includes(k.addr))
      if (!key) return

      let label
      let seedId
      if (key.type === 'internal') {
        const seed = seeds.find((s) => s.id === key.meta.fromSeedId)
        if (!seed) return
        label = seed.label
        seedId = seed.id
      } else {
        label = `${key.type}-${key.meta.deviceId}`
      }

      let group = accountGroups.find((g) => g.label === label)
      if (!group) {
        group = { label, seedId, accounts: [] }
        accountGroups.push(group)
      }
      group.accounts.push(acc)
    })

    return accountGroups
  }, [accounts, keys, seeds])

  const handleViewDappAccounts = () => {
    setViewMode('dapp-accounts')
    setScreenMode('view-accounts')
  }

  const handleViewAllAccounts = () => {
    setViewMode('all-accounts')
    setScreenMode('view-accounts')
  }

  const handleBack = () => {
    setViewMode('buttons')
    setScreenMode('all')
  }

  const handleSelectAccount = (accountAddr: string) => {
    setSelectedAccount({ isNew: false, address: accountAddr })
  }

  if (viewMode === 'buttons') {
    return (
      <View style={{ flex: 1 }}>
        <Button
          text={t(`View Existing Dapp Accounts (${dappAccounts.length})`)}
          type="gray"
          size="small"
          onPress={handleViewDappAccounts}
          style={spacings.mbTy}
          disabled={dappAccounts.length === 0}
        />
        <Button
          text={t(`View All Accounts (${accounts.length})`)}
          type="secondary"
          size="small"
          onPress={handleViewAllAccounts}
        />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          spacings.mbSm
        ]}
      >
        <Text fontSize={16} weight="semiBold" appearance="primaryText">
          {viewMode === 'dapp-accounts' ? t('Dapp Accounts') : t('All Accounts')}
        </Text>
        <Button text={t('Back')} size="small" onPress={handleBack} />
      </View>

      {viewMode === 'dapp-accounts' && (
        <ScrollView style={{ flex: 1 }}>
          {dappAccounts.length === 0 ? (
            <View style={[spacings.pv, spacings.ph]}>
              <Text appearance="secondaryText" style={{ textAlign: 'center' }}>
                {t('No accounts previously connected to this dapp')}
              </Text>
            </View>
          ) : (
            <View>
              <View
                style={[
                  spacings.pvSm,
                  spacings.phSm,
                  { backgroundColor: theme.secondaryBackground, borderRadius: 8 }
                ]}
              >
                <Text fontSize={13} appearance="secondaryText">
                  {t('Previously connected to this dapp')}
                </Text>
              </View>
              <View style={spacings.mtSm}>
                {dappAccounts.map((account) => (
                  <AccountOption
                    key={account.addr}
                    account={account}
                    onSelect={() => handleSelectAccount(account.addr)}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {viewMode === 'all-accounts' && (
        <ScrollView style={{ flex: 1 }}>
          {groupedAccounts.map((group) => (
            <View key={group.label} style={spacings.mbTy}>
              <Text
                weight="medium"
                appearance="secondaryText"
                numberOfLines={1}
                style={spacings.mbSm}
              >
                {group.label}
              </Text>
              {group.accounts.map((account) => (
                <AccountOption
                  key={account.addr}
                  account={account}
                  onSelect={() => handleSelectAccount(account.addr)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const DappAccountSelector: FC<Props> = ({ setSelectedAccount, origin, setScreenMode }) => {
  const dappId = useMemo(() => getDappIdFromUrl(origin || ''), [origin])

  return (
    <AccountSelector
      setSelectedAccount={setSelectedAccount}
      setScreenMode={setScreenMode}
      dappId={dappId}
    />
  )
}

export default React.memo(DappAccountSelector)
