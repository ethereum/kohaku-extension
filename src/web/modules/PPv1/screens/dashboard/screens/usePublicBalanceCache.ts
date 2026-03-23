import { useCallback, useEffect, useRef, useState } from 'react'

import useBackgroundService from '@web/hooks/useBackgroundService'

const usePublicBalanceCache = ({
  accounts,
  accountAddr,
  portfolioIsAllReady,
  portfolioTotalBalance
}: {
  accounts: { addr: string }[]
  accountAddr: string | undefined
  portfolioIsAllReady: boolean | undefined
  portfolioTotalBalance: number | null | undefined
}) => {
  const { dispatch } = useBackgroundService()
  const [balanceCache, setBalanceCache] = useState<{ [addr: string]: number }>({})
  const loadQueueRef = useRef<string[]>([])
  const originalAccountRef = useRef<string | null>(null)
  const [isLoadingPublicBalances, setIsLoadingPublicBalances] = useState(true)

  // Update cache whenever the selected account's portfolio is ready
  useEffect(() => {
    if (accountAddr && portfolioIsAllReady && portfolioTotalBalance != null) {
      setBalanceCache((prev) => {
        if (prev[accountAddr] === portfolioTotalBalance) return prev
        return { ...prev, [accountAddr]: portfolioTotalBalance }
      })
    }
  }, [accountAddr, portfolioIsAllReady, portfolioTotalBalance])

  // On mount, queue all accounts for balance loading
  useEffect(() => {
    if (!accounts.length || !accountAddr) return
    if (originalAccountRef.current) return

    originalAccountRef.current = accountAddr
    const otherAddrs = accounts.map((a) => a.addr).filter((addr) => addr !== accountAddr)
    loadQueueRef.current = otherAddrs

    if (!otherAddrs.length) setIsLoadingPublicBalances(false)
  }, [accounts, accountAddr])

  // Process the load queue: when portfolio is ready, select the next account
  useEffect(() => {
    if (!portfolioIsAllReady || !accountAddr) return
    if (!loadQueueRef.current.length) {
      if (
        originalAccountRef.current &&
        accountAddr !== originalAccountRef.current &&
        isLoadingPublicBalances
      ) {
        dispatch({
          type: 'MAIN_CONTROLLER_SELECT_ACCOUNT',
          params: { accountAddr: originalAccountRef.current }
        })
      }
      setIsLoadingPublicBalances(false)
      return
    }

    const timer = setTimeout(() => {
      const nextAddr = loadQueueRef.current.shift()
      if (nextAddr) {
        dispatch({ type: 'MAIN_CONTROLLER_SELECT_ACCOUNT', params: { accountAddr: nextAddr } })
      }
    }, 1500)

    return () => clearTimeout(timer)
  }, [portfolioIsAllReady, accountAddr, dispatch, isLoadingPublicBalances])

  const refreshPublicBalances = useCallback(() => {
    if (!accounts.length || !accountAddr) return
    setBalanceCache({})
    setIsLoadingPublicBalances(true)
    const otherAddrs = accounts.map((a) => a.addr).filter((addr) => addr !== accountAddr)
    loadQueueRef.current = otherAddrs
    originalAccountRef.current = accountAddr
    dispatch({ type: 'MAIN_CONTROLLER_SELECT_ACCOUNT', params: { accountAddr } })
  }, [accounts, accountAddr, dispatch])

  return { balanceCache, isLoadingPublicBalances, refreshPublicBalances }
}

export default usePublicBalanceCache
