// import { uniqBy } from 'lodash'
import groupBy from 'lodash/groupBy'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NativeScrollEvent, View } from 'react-native'
import { createPublicClient, http } from 'viem'

import AccountPickerController from '@ambire-common/controllers/accountPicker/accountPicker'
import { Account as AccountInterface, AccountOnPage } from '@ambire-common/interfaces/account'
import {
  isDerivedForSmartAccountKeyOnly,
  isSmartAccount
} from '@ambire-common/libs/account/account'
import shortenAddress from '@ambire-common/utils/shortenAddress'
// import WarningFilledIcon from '@common/assets/svg/WarningFilledIcon'
import Alert from '@common/components/Alert'
// import Badge from '@common/components/Badge'
import Pagination from '@common/components/Pagination'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
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
  isScanComplete: boolean
  onScanComplete: () => void
  children?: any
}

const AccountsOnPageList = ({
  state,
  setPage,
  subType,
  isLoading,
  isScanComplete,
  onScanComplete,
  children
}: Props) => {
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { networks } = useNetworksControllerState()
  const accountPickerState = useAccountPickerControllerState()
  const [hasReachedBottom, setHasReachedBottom] = useState<null | boolean>(null)
  const [containerHeight, setContainerHeight] = useState(0)
  const [contentHeight, setContentHeight] = useState(0)
  const { styles, themeType } = useTheme(getStyles)

  const slots = useMemo(() => {
    // Only basic accounts; a smart account's controlling key is drawn under it.
    return groupBy(
      state.accountsOnPage.filter(
        (a) => !a.isLinked && !a.account.creation && !isDerivedForSmartAccountKeyOnly(a.index)
      ),
      'slot'
    )
  }, [state.accountsOnPage])

  // const hasLinkedAccounts = useMemo(
  //   () => state.accountsOnPage.some((a) => a.isLinked),
  //   [state.accountsOnPage]
  // )

  // The smart accounts are listed only when the picker selects them by default
  // (a newly created seed); the imports list basic accounts only.
  const shouldDisplaySmartAccounts = !!state.shouldSelectSmartAccountAutomatically

  const smartAccounts = useMemo(() => {
    if (!shouldDisplaySmartAccounts) {
      return []
    }

    return state.accountsOnPage.filter((a) => !a.isLinked && isSmartAccount(a.account))
  }, [shouldDisplaySmartAccounts, state.accountsOnPage])

  const [accountUsageMap, setAccountUsageMap] = useState<Record<string, boolean>>({})
  const [usageCheckComplete, setUsageCheckComplete] = useState(false)

  const scanStateRef = useRef<{
    phase: 'scanning' | 'at-target' | 'done'
    lastUsedPage: number | null
    pageAdvanceInitiated: boolean
  }>({ phase: 'scanning', lastUsedPage: null, pageAdvanceInitiated: false })

  const finishScan = useCallback(() => {
    scanStateRef.current.phase = 'done'
    onScanComplete?.()
  }, [onScanComplete])

  useEffect(() => {
    // scan is skipped when sub is priate key
    if (subType === 'private-key') onScanComplete?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    scanStateRef.current.pageAdvanceInitiated = false
    setUsageCheckComplete(false)

    if (!networks.length || !state.accountsOnPage.length) return

    let cancelled = false

    const checkUsage = async () => {
      const results: Record<string, boolean> = {}

      await Promise.all(
        state.accountsOnPage.map(async (acc) => {
          const address = acc.account.addr as `0x${string}`

          const isUsed = await networks.reduce(async (prevPromise, network) => {
            const alreadyUsed = await prevPromise
            if (alreadyUsed) return true
            try {
              const client = createPublicClient({ transport: http(network.selectedRpcUrl) })
              // console.log({ selectedRpcUrl: network.selectedRpcUrl, address })
              const [nonce, balance] = await Promise.all([
                client.getTransactionCount({ address }),
                client.getBalance({ address })
              ])
              return nonce > 0 || balance > 0n
            } catch {
              return false
            }
          }, Promise.resolve(false))

          console.log({ isUsed, address, acc })

          if (isUsed) results[address] = true
        })
      )

      if (!cancelled) {
        setAccountUsageMap(results)
        setUsageCheckComplete(true)
      }
    }

    checkUsage().catch(() => {
      if (!cancelled) setUsageCheckComplete(true)
    })

    return () => {
      cancelled = true
    }
  }, [state.accountsOnPage, networks])

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

  useEffect(() => {
    if (!usageCheckComplete || state.accountsLoading || isLoading) return
    if (subType === 'private-key') return
    // On a newly created seed the picker has already chosen what to add; a used
    // basic account is never selected on its own.
    if (state.shouldSelectSmartAccountAutomatically) {
      if (scanStateRef.current.phase !== 'done') finishScan()
      return
    }

    const scan = scanStateRef.current
    if (scan.phase === 'done') return

    const sortedAccounts = [...state.accountsOnPage]
      .filter((a) => !a.isLinked && !a.account.creation)
      .sort((a, b) => a.slot - b.slot)

    if (scan.phase === 'scanning') {
      if (scan.pageAdvanceInitiated) return

      const hasUsed = sortedAccounts.some((a) => accountUsageMap[a.account.addr])

      if (hasUsed) {
        sortedAccounts.forEach((acc) => {
          const alreadySelected = state.selectedAccounts.some(
            (s) => s.account.addr === acc.account.addr
          )
          if (!alreadySelected) handleSelectAccount(acc.account)
        })
        scan.lastUsedPage = state.page
        scan.pageAdvanceInitiated = true
        setPage(state.page + 1)
      } else if (scan.lastUsedPage !== null) {
        scan.phase = 'at-target'
        scan.pageAdvanceInitiated = true
        setPage(scan.lastUsedPage)
      } else {
        finishScan()
      }
    } else if (scan.phase === 'at-target') {
      // Find the last used account by slot order and select everything up to it
      const lastUsedIdx = sortedAccounts.reduce(
        (lastIdx, acc, i) => (accountUsageMap[acc.account.addr] ? i : lastIdx),
        -1
      )

      if (lastUsedIdx === -1) {
        finishScan()
        return
      }

      sortedAccounts.forEach((acc, i) => {
        const isSelected = state.selectedAccounts.some((s) => s.account.addr === acc.account.addr)
        if (i <= lastUsedIdx && !isSelected) {
          handleSelectAccount(acc.account)
        } else if (i > lastUsedIdx && isSelected) {
          handleDeselectAccount(acc.account)
        }
      })

      finishScan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usageCheckComplete, state.accountsLoading, isLoading])

  const isImportingFromPrivateKey = subType === 'private-key'

  const getAccounts = useCallback(
    ({
      accounts,
      isLastSlot = false
    }: {
      accounts: AccountOnPage[]
      isLastSlot?: boolean
      slotIndex?: number
    }) => {
      return accounts.map((acc, i: number) => {
        const hasBottomSpacing = !(isLastSlot && i === accounts.length - 1)
        const isUnused = !accountUsageMap[acc.account.addr]
        const isSelected = state.selectedAccounts.some(
          (selectedAcc) => selectedAcc.account.addr === acc.account.addr
        )

        return (
          <Account
            key={acc.account.addr}
            account={acc.account}
            type="basic"
            withBottomSpacing={hasBottomSpacing}
            unused={isUnused}
            isSelected={isSelected}
            importStatus={acc.importStatus}
            onSelect={handleSelectAccount}
            onDeselect={handleDeselectAccount}
            displayTypeBadge={false}
            displayTypePill={false}
            shouldBeDisplayedAsNew={false}
          />
        )
      })
    },
    [state.selectedAccounts, handleSelectAccount, handleDeselectAccount, accountUsageMap]
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
          {state.accountsLoading || !!isLoading || !isScanComplete ? (
            <View style={[flexbox.flex1, flexbox.center, spacings.mt2Xl]}>
              <Spinner style={styles.spinner} />
            </View>
          ) : (
            <>
              {!!smartAccounts.length && (
                <View
                  style={[
                    styles.smartAccountWrapper,
                    spacings.mbLg,
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
                  </View>
                  {smartAccounts.map((acc, i) => {
                    const keyEntry = state.accountsOnPage.find(
                      (a) =>
                        a.slot === acc.slot &&
                        !isSmartAccount(a.account) &&
                        isDerivedForSmartAccountKeyOnly(a.index)
                    )
                    const isLast = i === smartAccounts.length - 1
                    const isAccountSelected = (addr: string) =>
                      state.selectedAccounts.some(
                        (selectedAcc) => selectedAcc.account.addr === addr
                      )

                    const isSmartAccountSelected = isAccountSelected(acc.account.addr)
                    const isKeySelected = !!keyEntry && isAccountSelected(keyEntry.account.addr)

                    return (
                      <View key={acc.account.addr} style={!isLast && spacings.mbTy}>
                        {/* A switch keeps the position it was drawn with, so each row is
                            drawn again when its selection changes. */}
                        <Account
                          key={`${acc.account.addr}-${isSmartAccountSelected ? 'on' : 'off'}`}
                          account={acc.account}
                          type="smart"
                          withBottomSpacing={!!keyEntry}
                          unused={!accountUsageMap[acc.account.addr]}
                          isSelected={isSmartAccountSelected}
                          importStatus={acc.importStatus}
                          onSelect={handleSelectAccount}
                          onDeselect={handleDeselectAccount}
                          displayTypeBadge={false}
                          shouldBeDisplayedAsNew={false}
                        />
                        {!!keyEntry && (
                          <Account
                            key={`${keyEntry.account.addr}-${isKeySelected ? 'on' : 'off'}`}
                            account={keyEntry.account}
                            type="basic"
                            withBottomSpacing={false}
                            unused={!accountUsageMap[keyEntry.account.addr]}
                            isSelected={isKeySelected}
                            importStatus={keyEntry.importStatus}
                            onSelect={handleSelectAccount}
                            onDeselect={handleDeselectAccount}
                            displayTypeBadge={false}
                            displayTypePill={false}
                            shouldBeDisplayedAsNew={false}
                            caption={t('socialRecovery.create.controllingKeyRow', {
                              account: shortenAddress(acc.account.addr, 16)
                            })}
                          />
                        )}
                      </View>
                    )
                  })}
                </View>
              )}
              <View style={[spacings.ph, spacings.pbLg]}>
                {Object.keys(slots).map((key, i) => {
                  return (
                    <View key={key}>
                      {getAccounts({
                        accounts: slots[key],
                        isLastSlot: i === Object.keys(slots).length - 1,
                        slotIndex: 1
                      })}
                    </View>
                  )
                })}
              </View>
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
            isDisabled={state.isPageLocked || !isScanComplete}
            hideLastPage
          />
        )}
        {children}
      </View>
    </View>
  )
}

export default React.memo(AccountsOnPageList)
