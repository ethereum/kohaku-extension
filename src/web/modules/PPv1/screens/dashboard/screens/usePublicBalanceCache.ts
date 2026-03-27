import { useCallback, useEffect, useRef, useState } from 'react'

import useBackgroundService from '@web/hooks/useBackgroundService'
import eventBus from '@web/extension-services/event/eventBus'

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
  const [isLoadingPublicBalances, setIsLoadingPublicBalances] = useState(true)
  const hasRequestedRef = useRef(false)

  // Always keep the current account's balance up to date from its live portfolio
  useEffect(() => {
    if (accountAddr && portfolioIsAllReady && portfolioTotalBalance != null) {
      setBalanceCache((prev) => {
        if (prev[accountAddr] === portfolioTotalBalance) return prev
        return { ...prev, [accountAddr]: portfolioTotalBalance }
      })
    }
  }, [accountAddr, portfolioIsAllReady, portfolioTotalBalance])

  // On mount, request all account balances in parallel
  useEffect(() => {
    if (!accounts.length || !accountAddr || hasRequestedRef.current) return

    hasRequestedRef.current = true
    const otherAddrs = accounts.map((a) => a.addr).filter((addr) => addr !== accountAddr)

    if (!otherAddrs.length) {
      setIsLoadingPublicBalances(false)
      return
    }

    dispatch({
      type: 'PORTFOLIO_LOAD_ACCOUNTS_TOTAL_BALANCES',
      params: { accountAddrs: otherAddrs }
    })
  }, [accounts, accountAddr, dispatch])

  // Listen for the parallel-loaded results from the background
  useEffect(() => {
    const handler = (balances: { [addr: string]: number }) => {
      setBalanceCache((prev) => ({ ...prev, ...balances }))
      setIsLoadingPublicBalances(false)
    }

    eventBus.addEventListener('accountTotalBalances', handler)
    return () => eventBus.removeEventListener('accountTotalBalances', handler)
  }, [])

  const refreshPublicBalances = useCallback(() => {
    if (!accounts.length || !accountAddr) return
    setBalanceCache((prev) => ({ [accountAddr]: prev[accountAddr] }))
    setIsLoadingPublicBalances(true)
    hasRequestedRef.current = false

    const otherAddrs = accounts.map((a) => a.addr).filter((addr) => addr !== accountAddr)
    if (!otherAddrs.length) {
      setIsLoadingPublicBalances(false)
      return
    }

    dispatch({
      type: 'PORTFOLIO_LOAD_ACCOUNTS_TOTAL_BALANCES',
      params: { accountAddrs: otherAddrs }
    })
  }, [accounts, accountAddr, dispatch])

  return { balanceCache, isLoadingPublicBalances, refreshPublicBalances }
}

export default usePublicBalanceCache
