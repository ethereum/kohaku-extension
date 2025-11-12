import { getAddress } from 'ethers'

import { isValidAddress, isValidRailgunAddress } from '@ambire-common/services/address'

type AddressInputValidation = {
  address: string
  isRecipientDomainResolving: boolean
  isValidEns: boolean
  hasDomainResolveFailed: boolean
  overwriteError?: string | boolean
  overwriteValidLabel?: string
  allowRailgunAddresses?: boolean
}

const getAddressInputValidation = ({
  address,
  isRecipientDomainResolving,
  hasDomainResolveFailed = false,
  isValidEns,
  overwriteError,
  overwriteValidLabel,
  allowRailgunAddresses = false
}: AddressInputValidation): {
  message: any
  isError: boolean
} => {
  if (!address) {
    return {
      message: '',
      isError: true
    }
  }
  if (isRecipientDomainResolving) {
    return {
      message: 'Resolving domain...',
      isError: false
    }
  }

  // Return error from props if it's passed
  if (overwriteError) {
    return {
      message: overwriteError,
      isError: true
    }
  }
  // Return valid label from props if it's passed
  if (overwriteValidLabel) {
    return {
      message: overwriteValidLabel,
      isError: false
    }
  }
  if (hasDomainResolveFailed) {
    return {
      // Change ENS to domain if we add more resolvers
      message: 'Failed to resolve ENS. Please try again later or enter a hex address.',
      isError: true
    }
  }
  if (isValidEns) {
    return {
      message: 'Valid ENS domain',
      isError: false
    }
  }
  
  // Check for Railgun addresses if allowed
  // Trim the address before validation to handle any whitespace
  if (allowRailgunAddresses && address) {
    const trimmedAddress = address.trim()
    if (isValidRailgunAddress(trimmedAddress)) {
      return {
        message: 'Valid Railgun address',
        isError: false
      }
    }
  }
  
  if (address && isValidAddress(address)) {
    try {
      getAddress(address)
      return {
        message: 'Valid address',
        isError: false
      }
    } catch {
      return {
        message: 'Invalid checksum. Verify the address and try again.',
        isError: true
      }
    }
  }
  if (address && !isValidAddress(address)) {
    return {
      message: 'Please enter a valid address or ENS domain',
      isError: true
    }
  }

  return {
    message: '',
    isError: true
  }
}

export default getAddressInputValidation
