import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView, View } from 'react-native'
import { Modalize } from 'react-native-modalize'

import { Account } from '@ambire-common/interfaces/account'
import DeleteIcon from '@common/assets/svg/DeleteIcon'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import Input from '@common/components/Input'
import { PanelBackButton, PanelTitle } from '@common/components/Panel/Panel'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'
import { TAB_CONTENT_WIDTH } from '@web/constants/spacings'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'

interface Props {
    sheetRef: React.RefObject<Modalize>
    closeBottomSheet: () => void
    account: Account | null
}

const AccountDappAccessBottomSheet: FC<Props> = ({ sheetRef, closeBottomSheet, account }) => {
    const { accounts } = useAccountsControllerState();
    const { theme, themeType } = useTheme()
    const { t } = useTranslation()
    const { dispatch } = useBackgroundService()
    const [dappUrl, setDappUrl] = React.useState('')
    const [dappUrlError, setDappUrlError] = React.useState<string | undefined>(undefined)

    const currentAccount = useMemo(() => {
        if (!account) return null
        return accounts.find(acc => acc.addr === account.addr) || null
    }, [account, accounts])

    const addDappUrl = () => {
        setDappUrlError(undefined)

        if (!dappUrl || dappUrl.trim() === '') {
            setDappUrlError('Dapp URL is required')
            return
        }

        let domain;
        try {
            const urlObj = new URL(dappUrl.startsWith('http') ? dappUrl : `https://${dappUrl}`)
            domain = urlObj.hostname
            const domainParts = domain.split('.')
            if (domainParts.length > 2) {
                domain = domainParts.slice(-2).join('.')
            }
        } catch (error) {
            setDappUrlError('Invalid Dapp URL')
            return
        }

        let dappUrls = currentAccount?.associatedDapps || []
        if (dappUrls.includes(domain)) {
            setDappUrlError('Dapp URL already added')
            return
        }

        dappUrls.push(domain)
        setDappUrl('')
        dispatch({
            type: "ACCOUNTS_CONTROLLER_SET_ASSOCIATED_DAPPS",
            params: {
                addr: account?.addr,
                dappUrls
            }
        })
    }

    const removeDappUrl = (url: string) => {
        let dappUrls = currentAccount?.associatedDapps || []
        dappUrls = dappUrls.filter(dapp => dapp !== url)

        dispatch({
            type: "ACCOUNTS_CONTROLLER_SET_ASSOCIATED_DAPPS",
            params: {
                addr: account?.addr,
                dappUrls
            }
        })
    }

    return (
        <BottomSheet
            id='accounts-dapp-access-bottom-sheet'
            sheetRef={sheetRef}
            closeBottomSheet={closeBottomSheet}
            backgroundColor={themeType === THEME_TYPES.DARK ? 'secondaryBackground' : 'primaryBackground'}
            scrollViewProps={{ contentContainerStyle: { flex: 1 } }}
            isScrollEnabled={false}
            containerInnerWrapperStyles={{ flex: 1 }}
            style={{ maxWidth: 432, minHeight: 432, ...spacings.pvLg }}
        >
            {!!currentAccount ? (
                <>
                    <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                        <PanelBackButton onPress={closeBottomSheet} style={spacings.mrTy} />
                        <PanelTitle
                            title={t('{{accName}} Dapp Access', { accName: currentAccount.preferences.label })}
                            style={text.left}
                        />
                    </View>
                    <View style={[flexbox.directionRow]}>
                        <Text weight="medium" fontSize={14} appearance="secondaryText">
                            {t(
                                "Link this account to specific Dapps. When you open one of these sites, the wallet will recommend using this account.",
                            )}
                        </Text>
                    </View>
                    <ScrollView
                        style={flexbox.flex1}
                        contentContainerStyle={{ flexGrow: 1 }}
                    >
                        {currentAccount.associatedDapps && currentAccount.associatedDapps.map((dapp) => (
                            <View style={[flexbox.directionRow, flexbox.justifySpaceBetween, flexbox.alignCenter, spacings.pvMi]} key={dapp}>
                                <View style={[{ flex: 1 }, spacings.plMi]}>
                                    <Text selectable appearance='secondaryText'>{dapp}</Text>
                                </View>
                                <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                                    <Button
                                        type="ghost"
                                        size="small"
                                        onPress={() => removeDappUrl(dapp)}
                                        hasBottomSpacing={false}
                                    >
                                        <DeleteIcon width={20} height={20} color={theme.errorText} />
                                    </Button>
                                </View>
                            </View>
                        ))}

                    </ScrollView>
                    <>
                        <Input placeholder='Dapp URL' error={dappUrlError} onChangeText={setDappUrl} value={dappUrl} />
                        <Button text='Add Dapp' onPress={addDappUrl} />
                    </>
                </>
            ) : (
                <View style={[flexbox.alignCenter, flexbox.justifyCenter, flexbox.flex1]}>
                    <Spinner />
                </View>
            )}
        </BottomSheet>
    )
}

export default React.memo(AccountDappAccessBottomSheet)