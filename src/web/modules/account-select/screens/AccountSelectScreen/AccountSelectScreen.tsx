import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useModalize } from 'react-native-modalize'

import { Account as AccountType } from '@ambire-common/interfaces/account'
import AddIcon from '@common/assets/svg/AddIcon'
import BackButton from '@common/components/BackButton'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import ScrollableWrapper, { WRAPPER_TYPES } from '@common/components/ScrollableWrapper'
import Search from '@common/components/Search'
import Text from '@common/components/Text'
import useAccountsList from '@common/hooks/useAccountsList'
import useNavigation from '@common/hooks/useNavigation'
import useRoute from '@common/hooks/useRoute'
import useTheme from '@common/hooks/useTheme'
import DashboardSkeleton from '@common/modules/dashboard/screens/Skeleton'
import Header from '@common/modules/header/components/Header'
import { ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { TabLayoutContainer } from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import Account from '@web/modules/account-select/components/Account'
import AddAccount from '@web/modules/account-select/components/AddAccount'
import { getUiType } from '@web/utils/uiType'

import { zeroAddress } from 'viem'
import getStyles from './styles'

const extractTriggerAddAccountSheetParam = (search: string | undefined): boolean | null => {
  if (!search) return null

  const params = new URLSearchParams(search)
  const addAccount = params.get('triggerAddAccountBottomSheet')

  // Remove the addAccount parameter
  if (addAccount) {
    params.delete('triggerAddAccountBottomSheet')
    const updatedSearch = params.toString()

    // Updated URL back into the app, handle it here.
    window.history.replaceState(null, '', `?${updatedSearch}`)

    return addAccount === 'true'
  }

  return null
}

const AccountSelectScreen = () => {
  const { styles, theme } = useTheme(getStyles)
  const flatlistRef = useRef(null)
  const { accounts, control, keyExtractor, getItemLayout, shouldDisplayAccounts } = useAccountsList(
    { flatlistRef }
  )
  const { search: routeParams } = useRoute()
  const { navigate } = useNavigation()
  const { account } = useSelectedAccountControllerState()
  const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()
  const { t } = useTranslation()
  const accountsContainerRef = useRef(null)
  const [pendingToBeSetSelectedAccount, setPendingToBeSetSelectedAccount] = useState('')

  const shouldTriggerAddAccountSheetFromSearch = useMemo(
    () => extractTriggerAddAccountSheetParam(routeParams),
    [routeParams]
  )

  useEffect(() => {
    if (!shouldTriggerAddAccountSheetFromSearch) return

    // Added a 100ms in order to open the bottom sheet.
    const timeoutId = setTimeout(() => openBottomSheet(), 100)

    return () => clearTimeout(timeoutId)
  }, [openBottomSheet, shouldTriggerAddAccountSheetFromSearch])

  const onAccountSelect = useCallback(
    (addr: AccountType['addr']) => setPendingToBeSetSelectedAccount(addr),
    []
  )

  const renderItem = ({ item: acc }: { item: AccountType }) => {
    return <Account onSelect={onAccountSelect} key={acc.addr} account={acc} withSettings={false} />
  }

  useEffect(() => {
    // Navigate to the dashboard after the account is selected to avoid showing the dashboard
    // of the previously selected account.
    if (!account || !pendingToBeSetSelectedAccount) return

    if (pendingToBeSetSelectedAccount === zeroAddress) {
      navigate(ROUTES.pp1Home)
      return
    }

    if (account.addr === pendingToBeSetSelectedAccount) {
      navigate(ROUTES.dashboard)
    }
  }, [account, navigate, pendingToBeSetSelectedAccount])

  return !pendingToBeSetSelectedAccount ? (
    <TabLayoutContainer
      header={<Header withAmbireLogo />}
      footer={<BackButton />}
      width="lg"
      hideFooterInPopup
    >
      <View style={[flexbox.flex1, spacings.pv]} ref={accountsContainerRef}>
        <Search
          autoFocus
          control={control}
          placeholder="Search for account"
          style={styles.searchBar}
        />
        <ScrollableWrapper
          type={WRAPPER_TYPES.FLAT_LIST}
          style={[
            styles.container,
            {
              opacity: shouldDisplayAccounts ? 1 : 0
            }
          ]}
          wrapperRef={flatlistRef}
          data={accounts}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          keyExtractor={keyExtractor}
          ListEmptyComponent={<Text>{t('No accounts found')}</Text>}
        />
        <View style={[spacings.ptSm, flexbox.directionRow, { width: '100%' }]}>
          <Button
            testID="button-add-private-account"
            text={t('Add private account')}
            type="secondary"
            hasBottomSpacing={false}
            onPress={() => navigate(ROUTES.pp1Import)}
            childrenPosition="left"
            style={[{ flex: 1 }, spacings.mrSm]}
          >
            <AddIcon color={theme.primary} style={spacings.mrTy} />
          </Button>
          <Button
            testID="button-add-account"
            text={t('Add account')}
            type="primary"
            hasBottomSpacing={false}
            onPress={openBottomSheet as any}
            childrenPosition="left"
            style={{ flex: 1 }}
          >
            <AddIcon color="#fff" style={spacings.mrTy} />
          </Button>
        </View>
      </View>
      <BottomSheet
        id="account-select-add-account"
        sheetRef={sheetRef}
        adjustToContentHeight={!getUiType().isPopup}
        closeBottomSheet={closeBottomSheet}
        scrollViewProps={{ showsVerticalScrollIndicator: false }}
      >
        <AddAccount handleClose={closeBottomSheet as any} />
      </BottomSheet>
    </TabLayoutContainer>
  ) : (
    <DashboardSkeleton />
  )
}

export default React.memo(AccountSelectScreen)
