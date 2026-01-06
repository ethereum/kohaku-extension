import React, { FC, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'

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
    responsiveSizeMultiplier: number
    selectedAccount: string | null
    setSelectedAccount: React.Dispatch<React.SetStateAction<string | null>>
    onFullscreen?: (fullscreen: boolean) => void
    origin?: string
}

interface AccountOptionProps {
    account: AccountInterface
    isSelected: boolean
    onSelect: () => void
}

interface SeedPhraseGroupProps {
    label: string
    seedId: string
    onAddAccount: (seedId: string) => void
    accounts?: AccountInterface[]
    selectedAccount?: string | null
    onSelectAccount?: (accountAddr: string) => void
}

interface AccountSelectorProps {
    setSelectedAccount: (accountAddr: string) => void
    selectedAccount: string | null
    onFullscreen?: (fullscreen: boolean) => void
    onNewAccount: (seedId: string) => void
    dappId?: string
}

interface AccountGroup {
    label: string
    seedId?: string
    accounts: AccountInterface[]
}

const AccountOption: FC<AccountOptionProps> = ({ account, onSelect }) => {
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

const SeedPhraseGroup: FC<SeedPhraseGroupProps> = ({
    label,
    seedId,
    onAddAccount,
    accounts,
    selectedAccount,
    onSelectAccount
}) => {
    const { theme } = useTheme()

    return (
        <View style={spacings.mbTy}>
            <View
                style={[
                    flexbox.directionRow,
                    flexbox.alignCenter,
                    flexbox.justifySpaceBetween,
                ]}
            >
                <Text weight="medium" appearance="secondaryText" numberOfLines={1} style={flexbox.flex1}>
                    {label}
                </Text>
                <Pressable onPress={() => onAddAccount(seedId)} style={spacings.mlTy}>
                    <Text fontSize={24} weight="medium" appearance="secondaryText" style={{ color: theme.primary }}>
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
                            isSelected={selectedAccount === account.addr}
                            onSelect={() => onSelectAccount(account.addr)}
                        />
                    ))}
                </View>
            )}
        </View>
    )
}

const AccountSelector: FC<AccountSelectorProps> = ({
    setSelectedAccount,
    selectedAccount,
    onFullscreen,
    onNewAccount,
    dappId,
}) => {
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
        const recommended = accounts.filter(acc => acc.associatedDappIDs?.includes(dappId)) || [];

        if (recommended.length === 1) {
            setSelectedAccount(recommended[0].addr)
        }

        return recommended
    }, [accounts, dappId])

    const groupedAccounts = useMemo(() => {
        const accountGroups: AccountGroup[] = []

        accounts.forEach((acc) => {
            if (recommendedAccounts.find(a => a.addr === acc.addr)) return

            const associatedKeys = acc.associatedKeys;
            const key = keys.find(k => associatedKeys.includes(k.addr))
            if (!key) return

            let label;
            let seedId;
            if (key.type === 'internal') {
                const seed = seeds.find(s => s.id === key.meta.fromSeedId)
                if (!seed) return
                label = seed.label
                seedId = seed.id
            } else {
                label = `${key.type}-${key.meta.deviceId}`
            }

            let group = accountGroups.find(g => g.label === label)
            if (!group) {
                group = { label, seedId, accounts: [] }
                accountGroups.push(group)
            }
            group.accounts.push(acc)
        });

        return accountGroups
    }, [accounts, keys, seeds, recommendedAccounts])

    const seedPhraseGroups = useMemo(() => {
        return groupedAccounts.filter(group => group.seedId)
    }, [groupedAccounts])

    return (
        <View>
            {recommendedAccounts.length > 0 && (
                <View style={spacings.mb}>
                    {recommendedAccounts.map((account) => (
                        <AccountOption
                            key={account.addr}
                            account={account}
                            isSelected={selectedAccount === account.addr}
                            onSelect={() => setSelectedAccount(account.addr)}
                        />
                    ))}
                </View>
            )}

            {recommendedAccounts.length === 0 && !fullscreen && (
                <View>
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
                <View>
                    {groupedAccounts.map((group) => (
                        group.seedId ? (
                            <SeedPhraseGroup
                                key={group.label}
                                label={group.label}
                                seedId={group.seedId}
                                onAddAccount={onNewAccount}
                                accounts={group.accounts}
                                selectedAccount={selectedAccount}
                                onSelectAccount={setSelectedAccount}
                            />
                        ) : (
                            <View key={group.label} style={spacings.mbTy}>
                                <Text weight="medium" appearance="secondaryText" numberOfLines={1} style={spacings.mbSm}>
                                    {group.label}
                                </Text>
                                {group.accounts.map((account) => (
                                    <AccountOption
                                        key={account.addr}
                                        account={account}
                                        isSelected={selectedAccount === account.addr}
                                        onSelect={() => setSelectedAccount(account.addr)}
                                    />
                                ))}
                            </View>
                        )
                    ))}
                </View>
            )}

            <View style={[flexbox.directionRow, spacings.mb]}>
                <Button
                    type="secondary"
                    size="small"
                    text={fullscreen ? t('View Dapp Accounts') : t('View All Accounts')}
                    style={[flexbox.flex1, spacings.mhMi]}
                    onPress={onPressAllAccounts}
                />
            </View>
        </View>
    )
}

const DappAccountSelector: FC<Props> = ({
    selectedAccount,
    setSelectedAccount,
    onFullscreen,
    origin
}) => {
    const { accounts } = useAccountsControllerState()
    const { subType, initParams } = useAccountPickerControllerState()
    const { dispatch } = useBackgroundService()
    const [seedId, setSeedId] = React.useState<string | null>(null)
    const [accountPickerInitialized, setAccountPickerInitialized] = React.useState(false)
    const newlyAddedAccounts = useMemo(() => accounts.filter(acc => acc.newlyAdded), [accounts])

    const dappId = useMemo(() => getDappIdFromUrl(origin || ''), [origin])

    // Create the new account once a seed phrase is selected
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

        newlyAddedAccounts.map(acc => {
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
                params: [{
                    addr: acc.addr,
                    preferences: {
                        label,
                        pfp: acc.preferences.pfp
                    }
                }]
            })
        });

        // Reset state
        dispatch({ type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE' })
        dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET' })
    }, [newlyAddedAccounts, dispatch])

    const handleNewAccount = (seedId: string) => {
        setSeedId(seedId)
    }

    return (
        <AccountSelector
            setSelectedAccount={setSelectedAccount}
            selectedAccount={selectedAccount}
            onFullscreen={onFullscreen}
            onNewAccount={handleNewAccount}
            dappId={dappId}
        />
    )
}

export default React.memo(DappAccountSelector)