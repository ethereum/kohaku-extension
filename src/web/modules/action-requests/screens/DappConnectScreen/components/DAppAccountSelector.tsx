import React, { FC, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Pressable, View } from 'react-native'

import { Account as AccountInterface } from '@ambire-common/interfaces/account'
import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import Button from '@common/components/Button'
import Checkbox from '@common/components/Checkbox'
import Text from '@common/components/Text'
import spacings from '@common/styles/spacings'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import Account from '@web/modules/account-select/components/Account'

interface Props {
    responsiveSizeMultiplier: number
    selectedAccount: string | null
    setSelectedAccount: React.Dispatch<React.SetStateAction<string | null>>
    saveDappAccountPreference: boolean
    setSaveDappAccountPreference: React.Dispatch<React.SetStateAction<boolean>>
    onFullscreen?: (fullscreen: boolean) => void
    origin?: string
}

interface AccountOptionProps {
    account: AccountInterface
    isSelected: boolean
    onSelect: () => void
}

interface SeedPhraseOptionProps {
    label: string
    isSelected: boolean
    onSelect: () => void
}

interface AccountSelectorProps {
    responsiveSizeMultiplier: number
    setSelectedAccount: (accountAddr: string) => void
    selectedAccount: string | null
    saveDappAccountPreference: boolean
    setSaveDappAccountPreference: React.Dispatch<React.SetStateAction<boolean>>
    onFullscreen?: (fullscreen: boolean) => void
    onNewAccount: () => void
    dappId?: string
}
``
interface SeedPhraseSelectorProps {
    onCancel: () => void
    onSelect: (seedId: string) => void
}

const AccountOption: FC<AccountOptionProps> = ({ account, isSelected, onSelect }) => {
    const onAccountSelect = () => {
        onSelect()
    }

    return (
        <Pressable onPress={onAccountSelect}>
            <Animated.View style={[isSelected && { backgroundColor: '#E0E0E0' }]}>
                <Account
                    account={account}
                    isSelectable={false}
                    withSettings={false}
                />
            </Animated.View>
        </Pressable>
    )
}

const SeedPhraseOption: FC<SeedPhraseOptionProps> = ({ label, isSelected, onSelect }) => {
    return (
        <Pressable onPress={onSelect}>
            <Animated.View style={[
                { padding: 12, borderRadius: 8 },
                isSelected && { backgroundColor: '#E0E0E0' }
            ]}>
                <Text weight="medium" numberOfLines={1}>{label}</Text>
            </Animated.View>
        </Pressable>
    )
}

const AccountSelector: FC<AccountSelectorProps> = ({
    responsiveSizeMultiplier,
    setSelectedAccount,
    selectedAccount,
    saveDappAccountPreference,
    setSaveDappAccountPreference,
    onFullscreen,
    onNewAccount,
    dappId
}) => {
    const { t } = useTranslation()
    const { accounts } = useAccountsControllerState()
    const [fullscreen, setFullscreen] = React.useState(false)

    const onPressAllAccounts = () => {
        const newFullscreen = !fullscreen
        setFullscreen(newFullscreen)
        onFullscreen && onFullscreen(newFullscreen)
    }

    const recommendedAccounts = useMemo(() => {
        if (!dappId) return []
        return accounts.filter(acc => acc.associatedDappIDs?.includes(dappId)) || []
    }, [accounts, dappId])

    const remainingAccounts = useMemo(() => {
        return accounts.filter(acc => !recommendedAccounts?.includes(acc))
    }, [accounts, recommendedAccounts])

    return (
        <View>
            <Text fontSize={16} weight="medium" style={spacings.mbSm}>
                {t('Select account to connect:')}
            </Text>

            {recommendedAccounts.length > 0 && (
                <View style={{ marginBottom: responsiveSizeMultiplier * 16 }}>
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

            {fullscreen && (
                <View>
                    {remainingAccounts.map((account) => (
                        <AccountOption
                            key={account.addr}
                            account={account}
                            isSelected={selectedAccount === account.addr}
                            onSelect={() => setSelectedAccount(account.addr)}
                        />
                    ))}
                </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 16 }}>
                {recommendedAccounts.length == 0 && !fullscreen && (
                    <Button
                        type="secondary"
                        size="small"
                        text="New Account"
                        onPress={onNewAccount}
                        style={{ flex: 1, marginHorizontal: 4 }}
                    />
                )}
                {fullscreen && (
                    <Checkbox
                        label={t('Save Preference')}
                        value={saveDappAccountPreference}
                        onValueChange={setSaveDappAccountPreference}
                        style={{ flex: 1, marginHorizontal: 4 }}
                    />
                )}
                <Button
                    type="secondary"
                    size="small"
                    text={fullscreen ? t('View Dapp Accounts') : t('View All Accounts')}
                    style={{ flex: 1, marginHorizontal: 4 }}
                    onPress={onPressAllAccounts}
                />
            </View>
        </View>
    )
}

const SeedPhraseSelector: FC<SeedPhraseSelectorProps> = ({
    onCancel,
    onSelect,
}) => {
    const { t } = useTranslation()
    const { seeds } = useKeystoreControllerState()
    const [selectedSeedId, setSelectedSeedId] = React.useState<string | null>(null)
    return (
        <View>
            <Text fontSize={16} weight="medium" style={spacings.mbSm}>
                {t('Add from stored recovery phrases:')}
            </Text>

            <View style={{ marginBottom: 16 }}>
                {seeds.map((seed) => (
                    <SeedPhraseOption
                        key={seed.id}
                        label={seed.label}
                        isSelected={selectedSeedId === seed.id}
                        onSelect={() => setSelectedSeedId(seed.id)}
                    />
                ))}
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', marginBottom: 16 }}>
                <Button
                    type="secondary"
                    size="small"
                    text={t('Cancel')}
                    onPress={onCancel}
                    style={{ flex: 1, marginHorizontal: 4 }}
                />
                <Button
                    type="primary"
                    size="small"
                    text={t('Confirm Selection')}
                    onPress={() => onSelect(selectedSeedId!)}
                    disabled={!selectedSeedId}
                    style={{ flex: 1, marginHorizontal: 4 }}
                />
            </View>

        </View>
    )
}

const DappAccountSelector: FC<Props> = ({
    responsiveSizeMultiplier,
    selectedAccount,
    setSelectedAccount,
    saveDappAccountPreference,
    setSaveDappAccountPreference,
    onFullscreen,
    origin
}) => {
    const { accounts } = useAccountsControllerState()
    const { subType, initParams } = useAccountPickerControllerState()
    const { dispatch } = useBackgroundService()
    const [selectSeedPhraseModal, setSelectSeedPhraseModal] = React.useState(false)
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
        setSelectSeedPhraseModal(false)
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

    if (selectSeedPhraseModal) {
        return (
            <SeedPhraseSelector
                onCancel={() => setSelectSeedPhraseModal(false)}
                onSelect={(id: string) => {
                    setSeedId(id)
                    setSelectSeedPhraseModal(false)
                }}
            />
        )
    }

    return (
        <AccountSelector
            responsiveSizeMultiplier={responsiveSizeMultiplier}
            setSelectedAccount={setSelectedAccount}
            selectedAccount={selectedAccount}
            setSaveDappAccountPreference={setSaveDappAccountPreference}
            saveDappAccountPreference={saveDappAccountPreference}
            onFullscreen={onFullscreen}
            onNewAccount={() => setSelectSeedPhraseModal(true)}
            dappId={dappId}
        />
    )
}

export default React.memo(DappAccountSelector)