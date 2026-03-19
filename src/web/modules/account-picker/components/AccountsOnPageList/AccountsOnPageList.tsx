import { uniqBy } from 'lodash'
import groupBy from 'lodash/groupBy'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { NativeScrollEvent, View } from 'react-native'

import AccountPickerController from '@ambire-common/controllers/accountPicker/accountPicker'
import {
  Account as AccountInterface,
  AccountOnPage,
  ImportStatus
} from '@ambire-common/interfaces/account'
// import WarningFilledIcon from '@common/assets/svg/WarningFilledIcon'
import Alert from '@common/components/Alert'
// import Badge from '@common/components/Badge'
import Pagination from '@common/components/Pagination'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Spinner from '@common/components/Spinner'
// import Text from '@common/components/Text'
// import Tooltip from '@common/components/Tooltip'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
// import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import Account from '@web/modules/account-picker/components/Account'
import AnimatedDownArrow from '@web/modules/account-picker/components/AccountsOnPageList/AnimatedDownArrow/AnimatedDownArrow'
import AccountsRetrieveError from '@web/modules/account-picker/components/AccountsRetrieveError'

import getStyles from './styles'

const isCloseToBottom = ({ layoutMeasurement, contentOffset, contentSize }: NativeScrollEvent) => {
  const paddingToBottom = 20
  return layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom
}

type Props = {
  state: AccountPickerController
  setPage: (page: number) => void
  subType: AccountPickerController['subType']
  isLoading: boolean
  lookingForLinkedAccounts: boolean
  children?: any
}

const AccountsOnPageList = ({
  state,
  setPage,
  subType,
  isLoading,
  // lookingForLinkedAccounts,
  children
}: Props) => {
  // const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { networks } = useNetworksControllerState()
  const accountPickerState = useAccountPickerControllerState()
  const [hasReachedBottom, setHasReachedBottom] = useState<null | boolean>(null)
  const [containerHeight, setContainerHeight] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)
  const {
    styles
    // theme,
    // themeType
  } = useTheme(getStyles)

  const slots = useMemo(() => {
    return groupBy(
      [
        ...state.accountsOnPage.filter((a) => !a.isLinked),
        // A linked account with the same address could have multiple Basic accounts
        // added as keys. Therefore, it could appear multiple times in the list.
        // In this case, show it only one time. When it gets selected, all keys
        // will get selected (and later on, imported) below the hood.
        ...uniqBy(
          state.accountsOnPage.filter((a) => a.isLinked),
          (a) => a.account.addr
        )
      ],
      'slot'
    )
  }, [state.accountsOnPage])

  // const hasLinkedAccounts = useMemo(
  //   () => state.accountsOnPage.some((a) => a.isLinked),
  //   [state.accountsOnPage]
  // )

  const handleSelectAccount = useCallback(
    (account: AccountInterface) => {
      dispatch({
        type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_SELECT_ACCOUNT',
        params: { account }
      })
    },
    [dispatch]
  )

  const handleDeselectAccount = useCallback(
    (account: AccountInterface) => {
      dispatch({
        type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_DESELECT_ACCOUNT',
        params: { account }
      })
    },
    [dispatch]
  )

  const getType = useCallback((acc: any) => {
    if (!acc.account.creation) return 'basic'
    if (acc.isLinked) return 'linked'

    return 'smart'
  }, [])

  const isImportingFromPrivateKey = subType === 'private-key'

  const getAccounts = useCallback(
    ({
      accounts,
      isLastSlot = false,
      byType = ['basic', 'smart']
    }: {
      accounts: AccountOnPage[]
      isLastSlot?: boolean
      slotIndex?: number
      byType?: ('basic' | 'linked' | 'smart')[]
    }) => {
      const filteredAccounts = accounts.filter((a) => byType.includes(getType(a)))

      return filteredAccounts.map((acc, i: number) => {
        const hasBottomSpacing = !(isLastSlot && i === filteredAccounts.length - 1)
        const isUnused = !acc.account.usedOnNetworks.length
        const isSelected = state.selectedAccounts.some(
          (selectedAcc) => selectedAcc.account.addr === acc.account.addr
        )

        return (
          <Account
            key={acc.account.addr}
            account={acc.account}
            type={getType(acc)}
            withBottomSpacing={hasBottomSpacing}
            unused={isUnused}
            isSelected={isSelected}
            importStatus={acc.importStatus}
            onSelect={handleSelectAccount}
            onDeselect={handleDeselectAccount}
            displayTypeBadge={false}
            displayTypePill={getType(acc) === 'linked'}
            // Only show "new" badge for the last unused smart account.
            // Otherwise, multiple smart accounts could be displayed as "new",
            // because they could have identity on the Relayer, but still be unused.
            shouldBeDisplayedAsNew={
              isLastSlot &&
              getType(acc) === 'smart' &&
              isUnused &&
              acc.importStatus === ImportStatus.NotImported
            }
          />
        )
      })
    },
    [getType, state.selectedAccounts, handleSelectAccount, handleDeselectAccount]
  )

  const networkNamesWithAccountStateError = useMemo(() => {
    return accountPickerState.networksWithAccountStateError.map((chainId) => {
      return networks.find((n) => n.chainId === chainId)?.name
    })
  }, [accountPickerState.networksWithAccountStateError, networks])

  // Empty means it's not loading and no accounts on the current page are derived.
  // Should rarely happen - if the deriving request gets cancelled on the device
  // or if something goes wrong with deriving in general.
  const isAccountPickerEmpty = useMemo(
    () => !state.accountsLoading && state.accountsOnPage.length === 0,
    [state.accountsLoading, state.accountsOnPage]
  )

  useEffect(() => {
    if (
      state.accountsLoading ||
      contentHeight === containerHeight ||
      !Object.keys(slots).length ||
      !containerHeight ||
      !contentHeight
    )
      return

    const isScrollNotVisible = contentHeight <= containerHeight

    if (setHasReachedBottom && !hasReachedBottom) setHasReachedBottom(isScrollNotVisible)
  }, [
    contentHeight,
    containerHeight,
    setHasReachedBottom,
    hasReachedBottom,
    state.accountsLoading,
    slots
  ])

  const shouldDisplayAnimatedDownArrow =
    typeof hasReachedBottom === 'boolean' &&
    !hasReachedBottom &&
    !state.accountsLoading &&
    !isAccountPickerEmpty &&
    !state.pageError

  // Prevents the user from temporarily seeing (flashing) empty (error) states
  // while being navigated back (resetting the Account Picker state).
  if (!state.isInitialized) return null

  return (
    <View style={flexbox.flex1} nativeID="account-picker-page-list">
      <View style={flexbox.flex1}>
        {!!networkNamesWithAccountStateError.length && (
          <Alert
            type="warning"
            style={spacings.mbTy}
            title={`We cannot determine if your accounts are used on ${networkNamesWithAccountStateError.join(
              ', '
            )}`}
          />
        )}
        <ScrollableWrapper
          style={!isImportingFromPrivateKey && spacings.mbLg}
          contentContainerStyle={{
            flexGrow: 1
          }}
          onScroll={(e) => {
            if (isCloseToBottom(e.nativeEvent) && setHasReachedBottom) setHasReachedBottom(true)
          }}
          onLayout={(e) => {
            setContainerHeight(e.nativeEvent.layout.height)
          }}
          onContentSizeChange={(_, height) => {
            setContentHeight(height)
          }}
          scrollEventThrottle={400}
        >
          {!isLoading && (isAccountPickerEmpty || !!accountPickerState.pageError) && (
            <AccountsRetrieveError
              pageError={accountPickerState.pageError}
              page={accountPickerState.page}
              setPage={setPage}
            />
          )}
          {state.accountsLoading || !!isLoading ? (
            <View style={[flexbox.flex1, flexbox.center, spacings.mt2Xl]}>
              <Spinner style={styles.spinner} />
            </View>
          ) : (
            <>
              <View style={[spacings.ph, spacings.pbLg]}>
                {Object.keys(slots).map((key, i) => {
                  return (
                    <View key={key}>
                      {getAccounts({
                        accounts: slots[key],
                        isLastSlot: i === Object.keys(slots).length - 1,
                        slotIndex: 1,
                        byType: ['basic']
                      })}
                    </View>
                  )
                })}
              </View>
              {/* Smart accounts section - commented out
              {!!Object.keys(slots).length && (
                <View
                  style={[
                    styles.smartAccountWrapper,
                    {
                      borderWidth: themeType === THEME_TYPES.DARK ? 0 : 1,
                      // @ts-ignore
                      background:
                        themeType === THEME_TYPES.DARK
                          ? 'linear-gradient(81deg, #AD8FFF33 0%, #39F7EF33 100%)'
                          : 'linear-gradient(81deg, #F7F8FC 0%, #F1E8FF 100%)'
                    }
                  ]}
                >
                  <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbSm]}>
                    <Text fontSize={16} weight="medium" style={spacings.mrMd}>
                      {t('Smart accounts')}
                    </Text>
                    <View
                      style={[
                        flexbox.directionRow,
                        flexbox.justifySpaceBetween,
                        flexbox.alignCenter
                      ]}
                    >
                      {lookingForLinkedAccounts && (
                        <View style={[flexbox.alignCenter, flexbox.directionRow]}>
                          <Spinner style={{ width: 16, height: 16 }} />
                          <Text appearance="primary" style={[spacings.mlTy]} fontSize={14}>
                            {t('Looking for linked smart accounts')}
                          </Text>
                        </View>
                      )}
                      {!lookingForLinkedAccounts && hasLinkedAccounts && (
                        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                          <Badge
                            type="info"
                            size="md"
                            withRightSpacing
                            text={`Linked Smart Account (found on page ${state.page})`}
                            tooltipText="Linked smart accounts are accounts that were not created with a given key originally, but this key was authorized for that given account on any supported network."
                          />
                          <WarningFilledIcon data-tooltip-id="linked-accounts-warning" />
                          <Tooltip
                            id="linked-accounts-warning"
                            border={`1px solid ${theme.warningDecorative as any}`}
                            style={{
                              backgroundColor:
                                themeType === THEME_TYPES.DARK
                                  ? theme.warningDecorative
                                  : (theme.warningBackground as any),
                              color:
                                themeType === THEME_TYPES.DARK
                                  ? theme.primaryBackground
                                  : (theme.warningText as any)
                            }}
                            content="Do not add linked accounts you are not aware of!"
                          />
                        </View>
                      )}
                    </View>
                  </View>
                  {Object.keys(slots).map((key, i) => {
                    return (
                      <View key={key}>
                        {getAccounts({
                          accounts: slots[key],
                          isLastSlot: i === Object.keys(slots).length - 1,
                          slotIndex: 1,
                          byType: ['smart', 'linked']
                        })}
                      </View>
                    )
                  })}
                </View>
              )}
              */}
            </>
          )}
        </ScrollableWrapper>
        <AnimatedDownArrow isVisible={shouldDisplayAnimatedDownArrow} />
      </View>
      <View style={[flexbox.directionRow, flexbox.justifySpaceBetween, flexbox.alignCenter]}>
        {!isImportingFromPrivateKey && (
          <Pagination
            page={state.page}
            maxPages={1000}
            setPage={setPage}
            isDisabled={state.isPageLocked}
            hideLastPage
          />
        )}
        {children}
      </View>
    </View>
  )
}

export default React.memo(AccountsOnPageList)
