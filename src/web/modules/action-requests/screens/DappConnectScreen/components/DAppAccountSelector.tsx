import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Pressable, View } from 'react-native'

import { Account as AccountInterface } from '@ambire-common/interfaces/account'
import { isDappRequestAction } from '@ambire-common/libs/actions/actions'
import Text from '@common/components/Text'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useActionsControllerState from '@web/hooks/useActionsControllerState'
import Account from '@web/modules/account-select/components/Account'
import Button from '@common/components/Button'
import Checkbox from '@common/components/Checkbox'
import spacings from '@common/styles/spacings'
import { useModalize } from 'react-native-modalize'
import BottomSheet from '@common/components/BottomSheet'
import SavedSeedPhrases from '@web/modules/account-select/components/SavedSeedPhrases'

interface Props {
    responsiveSizeMultiplier: number
    selectedAccount: string | null
    setSelectedAccount: React.Dispatch<React.SetStateAction<string | null>>
    saveDappAccountPreference: boolean
    setSaveDappAccountPreference: React.Dispatch<React.SetStateAction<boolean>>
    onFullscreen?: (fullscreen: boolean) => void
}

interface AccountOptionProps {
    responsiveSizeMultiplier: number
    account: AccountInterface
    isSelected: boolean
    onSelect: () => void
    isRecommended: boolean
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
    setSelectedAccount,
    saveDappAccountPreference,
    setSaveDappAccountPreference,
    onFullscreen
}) => {
    const { t } = useTranslation()
    const { accounts } = useAccountsControllerState()
    const state = useActionsControllerState()
    const [fullscreen, setFullscreen] = React.useState(false)

    const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()

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
            let domain = url.hostname
            const domainParts = domain.split('.')
            if (domainParts.length > 2) {
                domain = domainParts.slice(-2).join('.')
            }
            return domain
        } catch {
            return null
        }
    }, [dappOrigin])

    const recommendedAccounts = useMemo(() => {
        if (!dappDomain) return []
        return accounts.filter(acc => acc.associatedDapps?.includes(dappDomain)) || []
    }, [accounts, dappDomain])

    const remainingAccounts = useMemo(() => {
        return accounts.filter(acc => !recommendedAccounts?.includes(acc))
    }, [accounts, recommendedAccounts])

    const onPressAllAccounts = () => {
        const newFullscreen = !fullscreen
        setFullscreen(newFullscreen)
        onFullscreen && onFullscreen(newFullscreen)
    }

    const onPressNewDappAccount = () => {
        openBottomSheet()
    }

    const handleSelectAccount = (accountAddr: string) => {
        setSelectedAccount(accountAddr)
    }

    if (!accounts.length) {
        return null
    }

    return (<>
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
                            onSelect={() => handleSelectAccount(account.addr)}
                            isRecommended={true}
                            responsiveSizeMultiplier={responsiveSizeMultiplier}
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
                            onSelect={() => handleSelectAccount(account.addr)}
                            isRecommended={false}
                            responsiveSizeMultiplier={responsiveSizeMultiplier}
                        />
                    ))}
                </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
                {recommendedAccounts.length == 0 && !fullscreen && (
                    <Button
                        type="secondary"
                        size="small"
                        text="New Dapp Account"
                        onPress={onPressNewDappAccount}
                        style={{ flex: 1, marginHorizontal: 4 }}
                    />
                )}
                {fullscreen && (
                    <Checkbox
                        label={t('Save Preferences')}
                        value={saveDappAccountPreference}
                        onValueChange={setSaveDappAccountPreference}
                        style={{ flex: 1, marginHorizontal: 4 }}
                    />
                )}
                <Button
                    type="secondary"
                    size="small"
                    text={fullscreen ? t('Dapp Accounts') : t('All Accounts')}
                    style={{ flex: 1, marginHorizontal: 4 }}
                    onPress={onPressAllAccounts}
                />
            </View>
        </View>

        <BottomSheet
            id="seed-phrases-bottom-sheet"
            sheetRef={sheetRef}
            adjustToContentHeight={false}
            containerInnerWrapperStyles={{ flex: 1 }}
            isScrollEnabled={false}
            closeBottomSheet={closeBottomSheet}
        >
            <SavedSeedPhrases handleClose={closeBottomSheet as any} />
        </BottomSheet>
    </>)
}

export default React.memo(DappAccountSelector)