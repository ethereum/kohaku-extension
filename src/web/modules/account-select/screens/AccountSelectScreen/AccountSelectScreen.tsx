import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TouchableOpacity, View } from 'react-native'
import { useModalize } from 'react-native-modalize'
import { zeroAddress } from 'viem'

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
import commnonStyles from '@common/styles/utils/common'
import { TabLayoutContainer } from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import Account from '@web/modules/account-select/components/Account'
import AddAccount from '@web/modules/account-select/components/AddAccount'
import { getUiType } from '@web/utils/uiType'
import DownArrowIcon from '@common/assets/svg/DownArrowIcon'

import getStyles from './styles'

type AccountItem = { type: 'account'; account: AccountType }

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
  const {
    accounts: [privateAccount, ...filteredAccounts],
    control,
    getItemLayout,
    shouldDisplayAccounts
  } = useAccountsList({ flatlistRef, privateFirst: true })

  const [isMyAccountsSectionCollapsed, setIsMyAccountsSectionCollapsed] = useState(true)
  const toggleMyAccountsSection = useCallback(
    () => setIsMyAccountsSectionCollapsed((prev) => !prev),
    []
  )

  const listData = useMemo<AccountItem[]>(
    () =>
      !isMyAccountsSectionCollapsed
        ? filteredAccounts.map((acc): AccountItem => ({ type: 'account', account: acc }))
        : [],
    [filteredAccounts, isMyAccountsSectionCollapsed]
  )

  const keyExtractor = useCallback((item: AccountItem) => item.account.addr, [])

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

  const renderItem = useCallback(
    // eslint-disable-next-line react/no-unused-prop-types
    ({ item }: { item: AccountItem }) => (
      <Account
        onSelect={onAccountSelect}
        key={item.account.addr}
        account={item.account}
        withSettings={false}
      />
    ),
    [onAccountSelect]
  )

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
        {/* <TouchableOpacity
          onPress={() => navigate(ROUTES.dashboard)}
          style={[
            flexbox.directionRow,
            flexbox.alignCenter,
            flexbox.justifySpaceBetween,
            spacings.phSm,
            spacings.pvSm,
            spacings.mtSm,
            commnonStyles.borderRadiusPrimary,
            { backgroundColor: theme.secondaryBackground }
          ]}
        >
          <Text fontSize={16} weight="semiBold">
            {t('Home')}
          </Text>
          <DownArrowIcon color={theme.primary} style={{ transform: [{ rotate: '90deg' }] }} />
        </TouchableOpacity> */}
        <Account
          onSelect={onAccountSelect}
          account={privateAccount}
          withSettings={false}
          containerStyle={spacings.mtTy}
        />
        <TouchableOpacity
          onPress={toggleMyAccountsSection}
          style={[
            flexbox.directionRow,
            flexbox.alignCenter,
            flexbox.justifySpaceBetween,
            spacings.phSm,
            spacings.pvSm,
            spacings.mbSm,
            commnonStyles.borderRadiusPrimary,
            { backgroundColor: theme.secondaryBackground }
          ]}
        >
          <View style={[flexbox.directionRow, flexbox.alignCenter]}>
            <Text fontSize={16} weight="semiBold">
              {t('My Accounts')}
            </Text>
            <View
              style={[
                spacings.phTy,
                spacings.pvMi,
                spacings.mlTy,
                flexbox.directionRow,
                flexbox.alignCenter,
                flexbox.justifyCenter,
                {
                  borderRadius: 9999,
                  backgroundColor: theme.tertiaryBackground
                }
              ]}
            >
              <Text fontSize={13}>{filteredAccounts.length}</Text>
            </View>
          </View>
          <DownArrowIcon
            color={theme.primary}
            style={{ transform: [{ rotate: isMyAccountsSectionCollapsed ? '-90deg' : '0deg' }] }}
          />
        </TouchableOpacity>
        <View style={[flexbox.flex1, { opacity: shouldDisplayAccounts ? 1 : 0 }]}>
          <ScrollableWrapper
            type={WRAPPER_TYPES.FLAT_LIST}
            style={styles.container}
            wrapperRef={flatlistRef}
            data={listData}
            renderItem={renderItem}
            getItemLayout={getItemLayout}
            keyExtractor={keyExtractor}
            ListEmptyComponent={
              isMyAccountsSectionCollapsed ? null : <Text>{t('No accounts found')}</Text>
            }
          />
        </View>
        <View style={[spacings.ptSm, flexbox.directionRow, { width: '100%' }]}>
          <Button
            testID="button-add-private-account"
            text={t('Import private balance')}
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
