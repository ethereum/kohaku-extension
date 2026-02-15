import React, { FC, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { Account as AccountInterface } from '@ambire-common/interfaces/account'
import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import Account from '@web/modules/account-select/components/Account'

interface Props {
  setSelectedAccount: React.Dispatch<React.SetStateAction<string | null>>
  onFullscreen?: (fullscreen: boolean) => void
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
      onSelect={(addr) => onSelect()}
      maxAccountAddrLength={30}
    />
  )
}

const SeedPhraseGroup: FC<{
  label: string
  seedId: string
  onAddAccount: (seedId: string) => void
  accounts?: AccountInterface[]
  onSelectAccount?: (accountAddr: string) => void
}> = ({ label, seedId, onAddAccount, accounts, onSelectAccount }) => {
  const { theme } = useTheme()
  const [hovered, setHovered] = React.useState(false)

  return (
    <View style={spacings.mbTy}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <Text weight="medium" appearance="secondaryText" numberOfLines={1} style={flexbox.flex1}>
          {label}
        </Text>
        <Pressable
          onPress={() => onAddAccount(seedId)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={[
            spacings.mhTy,
            common.borderRadiusPrimary,
            spacings.pvTy,
            spacings.phTy,
            hovered && { backgroundColor: theme.secondaryBackground }
          ]}
        >
          <Text
            fontSize={24}
            weight="medium"
            appearance="secondaryText"
            style={{ color: theme.primary, lineHeight: 24, includeFontPadding: false }}
          >
            +
          </Text>
        </Pressable>
      </View>
      {accounts && accounts.length > 0 && onSelectAccount && (
        <View style={spacings.mtTy}>
          {accounts.map((account) => (
            <AccountOption
              key={account.addr}
              account={account}
              onSelect={() => onSelectAccount(account.addr)}
            />
          ))}
        </View>
      )}
    </View>
  )
}

const AccountSelector: FC<{
  setSelectedAccount: (accountAddr: string) => void
  onFullscreen?: (fullscreen: boolean) => void
  onNewAccount: (seedId: string) => void
  dappId?: string
}> = ({ setSelectedAccount, onFullscreen, onNewAccount, dappId }) => {
  const { t } = useTranslation()
  const { accounts } = useAccountsControllerState()
  const { keys, seeds } = useKeystoreControllerState()

  const [fullscreen, setFullscreen] = React.useState(false)

  const onPressAllAccounts = () => {
    const newFullscreen = !fullscreen
    setFullscreen(newFullscreen)
    onFullscreen && onFullscreen(newFullscreen)
  }

  const recommendedAccounts = useMemo(() => {
    if (!dappId) return []
    const recommended = accounts.filter((acc) => acc.associatedDappIDs?.includes(dappId)) || []

    if (recommended.length === 1) {
      setSelectedAccount(recommended[0].addr)
    }

    return recommended
  }, [accounts, dappId])

  const groupedAccounts = useMemo(() => {
    const accountGroups: AccountGroup[] = []

    accounts.forEach((acc) => {
      if (recommendedAccounts.find((a) => a.addr === acc.addr)) return

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
  }, [accounts, keys, seeds, recommendedAccounts])

  const seedPhraseGroups = useMemo(() => {
    return groupedAccounts.filter((group) => group.seedId)
  }, [groupedAccounts])

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ minHeight: '50px', flex: 1 }}>
        {recommendedAccounts.length > 0 && (
          <View>
            {recommendedAccounts.map((account) => (
              <AccountOption
                key={account.addr}
                account={account}
                onSelect={() => setSelectedAccount(account.addr)}
              />
            ))}
          </View>
        )}

        {recommendedAccounts.length === 0 && !fullscreen && (
          <View style={spacings.mt}>
            <Text weight="medium" appearance="primaryText" numberOfLines={1} style={spacings.mbSm}>
              {t('Create a new account:')}
            </Text>
            {seedPhraseGroups.map((group) => (
              <SeedPhraseGroup
                key={group.seedId}
                label={group.label}
                seedId={group.seedId!}
                onAddAccount={onNewAccount}
              />
            ))}
          </View>
        )}

        {fullscreen && (
          <View style={spacings.mt}>
            {groupedAccounts.map((group) =>
              group.seedId ? (
                <SeedPhraseGroup
                  key={group.label}
                  label={group.label}
                  seedId={group.seedId}
                  onAddAccount={onNewAccount}
                  accounts={group.accounts}
                  onSelectAccount={setSelectedAccount}
                />
              ) : (
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
                      onSelect={() => setSelectedAccount(account.addr)}
                    />
                  ))}
                </View>
              )
            )}
          </View>
        )}
      </ScrollView>

      <Button
        type="secondary"
        size="small"
        text={fullscreen ? t('View Dapp Accounts') : t('View All Accounts')}
        style={[spacings.mhMi]}
        onPress={onPressAllAccounts}
      />
    </View>
  )
}

const DappAccountSelector: FC<Props> = ({ setSelectedAccount, onFullscreen, origin }) => {
  const { accounts } = useAccountsControllerState()
  const { subType, initParams } = useAccountPickerControllerState()
  const { dispatch } = useBackgroundService()
  const [seedId, setSeedId] = React.useState<string | null>(null)
  const [accountPickerInitialized, setAccountPickerInitialized] = React.useState(false)
  const newlyAddedAccounts = useMemo(() => accounts.filter((acc) => acc.newlyAdded), [accounts])

  const dappId = useMemo(() => getDappIdFromUrl(origin || ''), [origin])

  //? useEffects are used to step through the account creation process
  //? instead of a single function because the `dispatch` calls are async
  //? and we need to wait for state updates.

  // Create the new account with the selected seed phrase
  useEffect(() => {
    if (!seedId) return
    dispatch({
      type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_FROM_SAVED_SEED_PHRASE',
      params: { id: seedId }
    })

    setSeedId(null)
  }, [seedId, dispatch])

  // Trigger initialization of the new account
  useEffect(() => {
    if (accountPickerInitialized) return
    if (!initParams) return // Initialized by `MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_FROM_SAVED_SEED_PHRASE`
    if (subType !== 'seed') return

    setAccountPickerInitialized(true)
    dispatch({
      type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT'
    })
  }, [initParams, subType, dispatch])

  // Update the newly created account with dapp association and label
  useEffect(() => {
    if (!newlyAddedAccounts.length) return // Added by `MAIN_CONTROLLER_ACCOUNT_PICKER_INIT`

    newlyAddedAccounts.map((acc) => {
      dispatch({
        type: 'ACCOUNTS_CONTROLLER_SET_ASSOCIATED_DAPPS',
        params: {
          addr: acc.addr,
          dappUrls: [dappId]
        }
      })

      const label = `${new URL(origin || '').hostname} Dapp Account`
      dispatch({
        type: 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_PREFERENCES',
        params: [
          {
            addr: acc.addr,
            preferences: {
              label,
              pfp: acc.preferences.pfp
            }
          }
        ]
      })
    })

    // Reset state
    dispatch({ type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE' })
    dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET' })
  }, [newlyAddedAccounts, dispatch])

  const onNewAccount = (_seedId: string) => {
    setSeedId(_seedId)
  }

  return (
    <AccountSelector
      setSelectedAccount={setSelectedAccount}
      onFullscreen={onFullscreen}
      onNewAccount={onNewAccount}
      dappId={dappId}
    />
  )
}

export default React.memo(DappAccountSelector)
