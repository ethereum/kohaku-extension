import { ZeroAddress } from 'ethers'
import React, { FC, useEffect, useMemo, useState } from 'react'

import { HumanizerMetaAddress } from '@ambire-common/libs/humanizer/interfaces'
import { getAddressCaught } from '@ambire-common/utils/getAddressCaught'
import { Props as TextProps } from '@common/components/Text'
import SkeletonLoader from '@common/components/SkeletonLoader'
import { isExtension } from '@web/constants/browserapi'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useAddressBookControllerState from '@web/hooks/useAddressBookControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'

import BaseAddress from '../BaseAddress'
import { BenzinDomainsAddress, DomainsAddress } from '../DomainsAddress'

interface Props extends TextProps {
  address: string
  // example of highestPriorityAlias: a name coming from the humanizer's metadata
  highestPriorityAlias?: string
  humanizerInfo?: HumanizerMetaAddress
  hideLinks?: boolean
  chainId: bigint
}

const HumanizerAddressInner: FC<Props> = ({
  humanizerInfo,
  address,
  highestPriorityAlias,
  hideLinks = false,
  chainId,
  ...rest
}) => {
  const { portfolio } = useSelectedAccountControllerState()
  const accountsState = useAccountsControllerState()
  const { contacts = [] } = useAddressBookControllerState()
  const checksummedAddress = getAddressCaught(address)
  const [fetchedAddressLabel, setFetchedAddressLabel] = useState<null | string>(null)
  const [isFetching, setIsFetching] = useState(false)

  const localAddressLabel = useMemo(() => {
    const zeroAddressLabel = address === ZeroAddress && 'Zero Address'
    const contact = contacts.find((c) => c.address.toLowerCase() === address.toLowerCase())
    const account =
      accountsState?.accounts && accountsState.accounts.find((a) => a.addr === checksummedAddress)
    const hardcodedName = humanizerInfo?.name
    const tokenSymbol =
      portfolio?.tokens?.find((token) => token.address.toLowerCase() === address.toLowerCase())
        ?.symbol || humanizerInfo?.token?.symbol
    return (
      highestPriorityAlias ||
      zeroAddressLabel ||
      contact?.name ||
      account?.preferences?.label ||
      hardcodedName ||
      tokenSymbol
    )
  }, [
    highestPriorityAlias,
    contacts,
    humanizerInfo?.name,
    humanizerInfo?.token?.symbol,
    portfolio?.tokens,
    address,
    checksummedAddress,
    accountsState?.accounts
  ])

  useEffect(() => {
    if (!localAddressLabel && chainId) {
      setIsFetching(true)
      fetch(`https://cena.ambire.com/api/v3/contracts/${address}/${chainId}`)
        .then((r) => r.json())
        .then((r) => {
          setFetchedAddressLabel(r.name)
          setIsFetching(false)
        })
        .catch((error) => {
          console.error(error)
          setIsFetching(false)
        })
    }
  }, [address, chainId, localAddressLabel])

  // Show skeleton while fetching
  if (isFetching && !localAddressLabel && !fetchedAddressLabel) {
    return <SkeletonLoader width={120} height={16} appearance="tertiaryBackground" />
  }

  // highestPriorityAlias and account labels are of higher priority than domains
  if (localAddressLabel || fetchedAddressLabel)
    return (
      <BaseAddress address={checksummedAddress} hideLinks={hideLinks} chainId={chainId} {...rest}>
        {localAddressLabel || fetchedAddressLabel}
      </BaseAddress>
    )

  if (!isExtension) return <BenzinDomainsAddress address={checksummedAddress} {...rest} />

  return <DomainsAddress address={checksummedAddress} {...rest} />
}

export default React.memo(HumanizerAddressInner)
