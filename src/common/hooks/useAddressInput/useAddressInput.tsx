import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AddressState, AddressStateOptional } from '@ambire-common/interfaces/domains'
import { resolveENSDomain } from '@ambire-common/services/ensDomains'
import { MinNetworkConfig } from '@ambire-common/services/provider'

import { getRpcProviderForUI } from '@web/services/provider'
import useBackgroundService from '@web/hooks/useBackgroundService'
import getAddressInputValidation from './utils/validation'

interface Props {
  addressState: AddressState
  setAddressState: (newState: AddressStateOptional) => void
  overwriteError?: string
  overwriteValidLabel?: string
  handleCacheResolvedDomain: (address: string, domain: string, type: 'ens') => void
  // handleRevalidate is required when the address input is used
  // together with react-hook-form. It is used to trigger the revalidation of the input.
  // !!! Must be memoized with useCallback
  handleRevalidate?: () => void
}

const useAddressInput = ({
  addressState,
  setAddressState,
  overwriteError,
  overwriteValidLabel,
  handleCacheResolvedDomain,
  handleRevalidate
}: Props) => {
  const { dispatch } = useBackgroundService()
  const fieldValueRef = useRef(addressState.fieldValue)
  const fieldValue = addressState.fieldValue
  const [hasDomainResolveFailed, setHasDomainResolveFailed] = useState(false)
  const [debouncedValidation, setDebouncedValidation] = useState({
    isError: true,
    message: ''
  })

  const validation = useMemo(
    () =>
      getAddressInputValidation({
        address: addressState.fieldValue,
        isRecipientDomainResolving: addressState.isDomainResolving,
        isValidEns: !!addressState.ensAddress,
        hasDomainResolveFailed,
        overwriteError,
        overwriteValidLabel
      }),
    [
      addressState.fieldValue,
      addressState.isDomainResolving,
      addressState.ensAddress,
      hasDomainResolveFailed,
      overwriteError,
      overwriteValidLabel
    ]
  )

  const resolveDomains = useCallback(
    async (trimmedAddress: string) => {
      let ensAddress = ''
      const providerFactoryOverride = (network: MinNetworkConfig) =>
        getRpcProviderForUI(network, dispatch)

      // Keep the promise all as we may add more domain resolvers in the future
      await Promise.all([
        resolveENSDomain(trimmedAddress, undefined, providerFactoryOverride)
          .then((newEnsAddress: string) => {
            ensAddress = newEnsAddress

            if (ensAddress) {
              handleCacheResolvedDomain(ensAddress, fieldValue, 'ens')
            }
          })
          .catch((e) => {
            if (fieldValueRef.current !== fieldValue) return

            setHasDomainResolveFailed(true)
            ensAddress = ''
            console.error('Failed to resolve ENS domain:', e)
          })
      ])

      // The promises may resolve after the component is unmounted.
      if (fieldValueRef.current !== fieldValue) return

      setAddressState({
        ensAddress,
        isDomainResolving: false
      })
    },
    [handleCacheResolvedDomain, fieldValue, setAddressState, dispatch]
  )

  useEffect(() => {
    const { isError, message: latestMessage } = validation
    const { isError: debouncedIsError, message: debouncedMessage } = debouncedValidation

    if (latestMessage === debouncedMessage) return

    const shouldDebounce =
      // Both validations are errors
      isError === debouncedIsError &&
      // There is no ENS address
      !addressState.ensAddress &&
      // The message is not empty
      latestMessage

    // If debouncing is not required, instantly update
    if (!shouldDebounce) {
      setDebouncedValidation(validation)
      return
    }

    const timeout = setTimeout(() => {
      setDebouncedValidation(validation)
    }, 500)

    return () => {
      clearTimeout(timeout)
    }
  }, [
    addressState.ensAddress,
    debouncedValidation,
    debouncedValidation.isError,
    debouncedValidation.message,
    validation
  ])

  useEffect(() => {
    const trimmedAddress = fieldValue.trim()
    const dotIndexInAddress = trimmedAddress.indexOf('.')
    // There is a dot and it is not the first or last character
    const canBeDomain =
      dotIndexInAddress !== -1 &&
      dotIndexInAddress !== 0 &&
      dotIndexInAddress !== trimmedAddress.length - 1

    setHasDomainResolveFailed(false)

    if (!trimmedAddress || !canBeDomain) {
      setAddressState({
        ensAddress: '',
        isDomainResolving: false
      })
      return
    }

    setAddressState({
      isDomainResolving: true
    })

    // Debounce domain resolving
    const timeout = setTimeout(() => {
      resolveDomains(trimmedAddress)
    }, 300)

    return () => {
      clearTimeout(timeout)
    }
  }, [fieldValue, resolveDomains, setAddressState])

  useEffect(() => {
    fieldValueRef.current = addressState.fieldValue
  }, [addressState.fieldValue])

  useEffect(() => {
    if (!handleRevalidate) return

    handleRevalidate()
  }, [handleRevalidate, debouncedValidation, validation.message])

  const reset = useCallback(() => {
    setAddressState({
      fieldValue: '',
      ensAddress: '',
      isDomainResolving: false
    })
  }, [setAddressState])

  const RHFValidate = useCallback(() => {
    // Disable the form if the address is not the same as the debounced address
    // This disables the submit button in the delay window
    if (validation.message !== debouncedValidation?.message) return false

    // Disable the form if the address is resolving
    if (!debouncedValidation?.isError && debouncedValidation.message === 'Resolving domain...') {
      return false
    }

    // Disable the form if there is an error
    if (debouncedValidation?.isError)
      return !debouncedValidation?.isError && debouncedValidation.message === ''

    if (addressState.isDomainResolving) return false

    return true
  }, [
    addressState.isDomainResolving,
    debouncedValidation?.isError,
    debouncedValidation.message,
    validation.message
  ])

  return {
    validation: debouncedValidation,
    RHFValidate,
    resetAddressInput: reset,
    address: addressState.ensAddress || fieldValue
  }
}

export default useAddressInput
