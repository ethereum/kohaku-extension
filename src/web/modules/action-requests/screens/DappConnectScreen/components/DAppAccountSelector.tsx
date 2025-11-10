import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Animated, Pressable, View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import { Account as AccountInterface } from '@ambire-common/interfaces/account'
import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import Checkbox from '@common/components/Checkbox'
import Text from '@common/components/Text'
import spacings from '@common/styles/spacings'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import Account from '@web/modules/account-select/components/Account'
import SavedSeedPhrases from '@web/modules/account-select/components/SavedSeedPhrases'

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

const DappAccountSelector: FC<Props> = ({
    responsiveSizeMultiplier,
    selectedAccount,
    setSelectedAccount,
    saveDappAccountPreference,
    setSaveDappAccountPreference,
    onFullscreen,
    origin
}) => {
    const { t } = useTranslation()
    const { accounts } = useAccountsControllerState()
    const [fullscreen, setFullscreen] = React.useState(false)

    const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()

    const dappId = useMemo(() => getDappIdFromUrl(origin || ''), [origin])
    const recommendedAccounts = useMemo(() => {
        if (!dappId) return []
        return accounts.filter(acc => acc.associatedDappIDs?.includes(dappId)) || []
    }, [accounts, dappId])

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
                        />
                    ))}
                </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
                {recommendedAccounts.length == 0 && !fullscreen && (
                    <Button
                        type="secondary"
                        size="small"
                        text="New Account"
                        onPress={onPressNewDappAccount}
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