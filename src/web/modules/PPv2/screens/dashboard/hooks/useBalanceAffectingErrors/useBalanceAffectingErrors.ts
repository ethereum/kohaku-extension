import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalize } from 'react-native-modalize'

import { SelectedAccountBalanceError } from '@ambire-common/libs/selectedAccount/errors'
import useMainControllerState from '@web/hooks/useMainControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

const useBalanceAffectingErrors = () => {
  const { t } = useTranslation()
  const { balanceAffectingErrors, portfolio, portfolioStartedLoadingAtTimestamp } =
    useSelectedAccountControllerState()
  const { isOffline } = useMainControllerState()
  const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()
  const [isLoadingTakingTooLong, setIsLoadingTakingTooLong] = useState(false)
  /** Because errors change frequently due to background updates we have to store a snapshot
   * of the errors when the user clicks on the warning icon to display the errors in the bottom sheet.
   * Otherwise the user may want to screenshot the errors and the errors may change.
   */
  const [balanceAffectingErrorsSnapshot, setBalanceAffectingErrorsSnapshot] = useState<
    SelectedAccountBalanceError[]
  >([])

  const networksWithErrors = useMemo(() => {
    const allNetworkNames = balanceAffectingErrors.flatMap((banner) => banner.networkNames)

    const uniqueNetworkNames = [...new Set(allNetworkNames)]

    return uniqueNetworkNames
  }, [balanceAffectingErrors])

  const warningMessage = useMemo(() => {
    if (isLoadingTakingTooLong) {
      const allNetworkNames = balanceAffectingErrors.find(
        ({ id }) => id === 'loading-too-long'
      )?.networkNames

      if (!allNetworkNames) return t('Loading is taking too long.')

      const uniqueNetworkNames = [...new Set(allNetworkNames)]

      return t('Loading is taking too long on {{networks}}.', {
        networks: uniqueNetworkNames.join(', ')
      })
    }

    if (isOffline && portfolio.isAllReady) return t('Please check your internet connection.')

    if (balanceAffectingErrors.length) {
      if (balanceAffectingErrors.length === 1) {
        return t(balanceAffectingErrors[0].title)
      }

      return t(
        'Total balance may be inaccurate due to issues on {{networks}}. Click for more info.',
        {
          networks: networksWithErrors.join(', ')
        }
      )
    }

    return undefined
  }, [
    balanceAffectingErrors,
    isLoadingTakingTooLong,
    isOffline,
    networksWithErrors,
    portfolio.isAllReady,
    t
  ])

  const onIconPress = useCallback(() => {
    if (isLoadingTakingTooLong || isOffline) {
      return
    }

    setBalanceAffectingErrorsSnapshot(balanceAffectingErrors)
    openBottomSheet()
  }, [balanceAffectingErrors, isLoadingTakingTooLong, isOffline, openBottomSheet])

  const closeBottomSheetWrapped = useCallback(() => {
    setBalanceAffectingErrorsSnapshot([])
    closeBottomSheet()
  }, [closeBottomSheet])

  // Compare the current timestamp with the timestamp when the loading started
  // and if it takes more than 5 seconds, set isLoadingTakingTooLong to true
  useEffect(() => {
    if (!portfolioStartedLoadingAtTimestamp) {
      setIsLoadingTakingTooLong(false)
      return
    }

    const checkIsLoadingTakingTooLong = () => {
      const takesMoreThan5Seconds = Date.now() - portfolioStartedLoadingAtTimestamp > 5000

      setIsLoadingTakingTooLong(takesMoreThan5Seconds)
    }

    checkIsLoadingTakingTooLong()

    const interval = setInterval(() => {
      if (portfolio?.isAllReady) {
        clearInterval(interval)
        setIsLoadingTakingTooLong(false)
        return
      }

      checkIsLoadingTakingTooLong()
    }, 500)

    return () => {
      clearInterval(interval)
    }
  }, [portfolio?.isAllReady, portfolioStartedLoadingAtTimestamp])

  return {
    sheetRef,
    balanceAffectingErrorsSnapshot,
    warningMessage,
    onIconPress,
    closeBottomSheetWrapped,
    networksWithErrors,
    isLoadingTakingTooLong
  }
}

export default useBalanceAffectingErrors
