import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { FlatList } from 'react-native'

import { Account as AccountType } from '@ambire-common/interfaces/account'
import { findAccountDomainFromPartialDomain } from '@ambire-common/utils/domains'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useDomainsControllerState from '@web/hooks/useDomainsController/useDomainsController'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { zeroAddress } from 'viem'

const useAccountsList = ({
  flatlistRef
}: {
  flatlistRef?: React.RefObject<FlatList<AccountType>> | null
} = {}) => {
  const { control, watch } = useForm({
    mode: 'all',
    defaultValues: {
      search: ''
    }
  })
  const search = watch('search')
  const [shouldDisplayAccounts, setShouldDisplayAccounts] = useState(false)
  const { domains } = useDomainsControllerState()
  const { accounts } = useAccountsControllerState()
  const { account: selectedAccount } = useSelectedAccountControllerState()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const filteredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        if (!search) return true

        const doesAddressMatch = account.addr.toLowerCase().includes(search.toLowerCase())
        const doesDomainMatch = findAccountDomainFromPartialDomain(account.addr, search, domains)
        const doesLabelMatch = account.preferences.label
          .toLowerCase()
          .includes(search.toLowerCase())
        const isSmartAccount = !!account?.creation
        const doesSmartAccountMatch =
          isSmartAccount && 'smart account'.includes(search.toLowerCase())
        const doesBasicAccountMatch =
          !isSmartAccount && 'basic account'.includes(search.toLowerCase())

        return (
          doesAddressMatch ||
          doesLabelMatch ||
          doesSmartAccountMatch ||
          doesBasicAccountMatch ||
          doesDomainMatch
        )
      }),
    [accounts, domains, search]
  )

  const selectedAccountIndex = accounts.findIndex(
    (account) => account.addr === selectedAccount?.addr
  )

  const keyExtractor = useCallback((account: AccountType) => account.addr, [])

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 64,
      offset: 64 * index,
      index
    }),
    []
  )

  // Scrolls to the selected account in the FlatList
  // It's complexity comes from the fact that the FlatList is not mounted when the component is first rendered
  // and so are the accounts.
  const scrollToSelectedAccount = useCallback(
    (attempt: number = 0) => {
      const MAX_ATTEMPTS = 3
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (attempt > MAX_ATTEMPTS) {
        // Display the accounts after reaching MAX_ATTEMPTS
        setShouldDisplayAccounts(true)
        return
      }
      if (
        accounts.length &&
        selectedAccountIndex !== -1 &&
        flatlistRef?.current &&
        !shouldDisplayAccounts
      ) {
        try {
          flatlistRef.current.scrollToIndex({
            animated: false,
            index: selectedAccountIndex
          })
          setShouldDisplayAccounts(true)
        } catch (error) {
          console.warn(`Failed to scroll to the selected account. Attempt ${attempt}`, error)
          timeoutRef.current = setTimeout(() => scrollToSelectedAccount(attempt + 1), 100)
        }
      }
    },
    [accounts.length, flatlistRef, shouldDisplayAccounts, selectedAccountIndex]
  )

  const privateAccount = {
    addr: zeroAddress,
    associatedKeys: [zeroAddress],
    initialPrivileges: [],
    creation: null,
    newlyCreated: false,
    newlyAdded: false,
    preferences: {
      label: 'Private Account',
      pfp: ''
    },
    usedOnNetworks: []
  }

  const allAccounts = [...filteredAccounts, privateAccount]

  useEffect(() => {
    scrollToSelectedAccount()
  }, [scrollToSelectedAccount])

  return {
    accounts: allAccounts,
    selectedAccountIndex,
    control,
    search,
    keyExtractor,
    getItemLayout,
    shouldDisplayAccounts
  }
}

export default useAccountsList
