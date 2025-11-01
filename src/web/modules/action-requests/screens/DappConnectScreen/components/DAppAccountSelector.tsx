import React, { FC, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Pressable, View } from 'react-native'

import { Account as AccountInterface } from '@ambire-common/interfaces/account'
import { isDappRequestAction } from '@ambire-common/libs/actions/actions'
import Text from '@common/components/Text'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import Account from '@web/modules/account-select/components/Account'

interface Props {
    responsiveSizeMultiplier: number
    selectedAccount: string | null
    setSelectedAccount: React.Dispatch<React.SetStateAction<string | null>>
}

interface AccountOptionProps {
    account: AccountInterface
    isSelected: boolean
    onSelect: () => void
    isRecommended: boolean
    responsiveSizeMultiplier: number
}

const AccountOption: FC<AccountOptionProps> = ({ account, isSelected, onSelect, isRecommended, responsiveSizeMultiplier }) => {
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

const DappAccountSelector: FC<Props> = ({
    responsiveSizeMultiplier,
    selectedAccount,
    setSelectedAccount
}) => {
    const { t } = useTranslation()
    const { accounts } = useAccountsControllerState()
    const { dispatch } = useBackgroundService()
    const state = useActionsControllerState()

    const userRequest = useMemo(() => {
        if (!isDappRequestAction(state.currentAction)) return null
        if (state.currentAction.userRequest.action.kind !== 'dappConnect') return null
        return state.currentAction.userRequest
    }, [state.currentAction])

    const dappOrigin = useMemo(() => userRequest?.session?.origin, [userRequest])
    const dappDomain = useMemo(() => {
        if (!dappOrigin) return null
        try {
            const url = new URL(dappOrigin)
            return url.hostname
        } catch {
            return dappOrigin
        }
    }, [dappOrigin])

    const recommendedAccounts = useMemo(() => {
        if (!dappDomain) return []
        return accounts.filter(acc => acc.associatedDapps?.includes(dappDomain)) || []
    }, [accounts, dappDomain])

    const remainingAccounts = useMemo(() => {
        return accounts.filter(acc => !recommendedAccounts?.includes(acc))
    }, [accounts, recommendedAccounts])

    const handleSelectAccount = (accountAddr: string) => {
        setSelectedAccount(accountAddr)
    }

    if (!accounts.length) {
        return null
    }

    return (
        <View>
            <Text fontSize={16} weight="medium">
                {t('Select account to connect:')}
            </Text>
            {recommendedAccounts.length > 0 && (
                <View style={{ marginBottom: responsiveSizeMultiplier * 16 }}>
                    <Text>
                        {t('Recommended accounts for {{dappDomain}}:', { dappDomain })}
                    </Text>
                    {recommendedAccounts.map((account) => (
                        <AccountOption
                            key={account.addr}
                            account={account}
                            isSelected={selectedAccount === account.addr}
                            onSelect={() => handleSelectAccount(account.addr)}
                            isRecommended={true}
                            responsiveSizeMultiplier={responsiveSizeMultiplier}
                        />
                    ))}
                </View>
            )}

            <View>
                {remainingAccounts.map((account) => (
                    <AccountOption
                        key={account.addr}
                        account={account}
                        isSelected={selectedAccount === account.addr}
                        onSelect={() => handleSelectAccount(account.addr)}
                        isRecommended={false}
                        responsiveSizeMultiplier={responsiveSizeMultiplier}
                    />
                ))}
            </View>
        </View>
    )
}

export default React.memo(DappAccountSelector)