/* eslint-disable no-param-reassign */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Pressable, View, ViewStyle } from 'react-native'

import { getFeatures } from '@ambire-common/libs/networks/networks'
import { isColibriSupportedChain } from '@ambire-common/services/provider'
import { isValidURL } from '@ambire-common/services/validations'
import CopyIcon from '@common/assets/svg/CopyIcon'
import Button from '@common/components/Button'
import Checkbox from '@common/components/Checkbox'
import Input from '@common/components/Input'
import NetworkIcon from '@common/components/NetworkIcon'
import NumberInput from '@common/components/NumberInput'
import ScrollableWrapper from '@common/components/ScrollableWrapper'
import Text from '@common/components/Text'
import Tooltip from '@common/components/Tooltip'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import text from '@common/styles/utils/text'
import { setStringAsync } from '@common/utils/clipboard'
import NetworkAvailableFeatures from '@web/components/NetworkAvailableFeatures'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useHover, { AnimatedPressable } from '@web/hooks/useHover'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import {
  getAreDefaultsChanged,
  handleErrors
} from '@web/modules/settings/screens/NetworksSettingsScreen/NetworkForm/helpers'
import { getRpcProviderForUI } from '@web/services/provider'

import getStyles from './styles'

type RpcSelectorItemType = {
  index: number
  url: string
  rpcUrlsLength: number
  forceLargeItems?: boolean
  selectedRpcUrl?: string
  shouldShowRemove: boolean
  style?: ViewStyle
  onPress: (url: string) => void
  onRemove?: (url: string) => void
}

type RpcProviderOptionValue = 'rpc' | 'helios' | 'colibri'
type RpcProviderSelectorItemType = {
  index: number
  value: RpcProviderOptionValue
  label: string
  isSelected: boolean
  itemsLength: number
  disabled?: boolean
  onSelect: (value: RpcProviderOptionValue) => void
  style?: ViewStyle
  testID?: string
}

type NetworkFormValues = {
  name: string
  rpcUrl: string
  rpcUrls?: string[]
  selectedRpcUrl?: string
  consensusRpcUrl: string
  heliosCheckpoint: string
  proverRpcUrl: string
  chainId: string
  rpcProvider: RpcProviderOptionValue
  nativeAssetSymbol: string
  nativeAssetName: string
  explorerUrl: string
  coingeckoPlatformId: string
  coingeckoNativeAssetId: string
}

type ControllerRenderArgs = {
  field: {
    onChange: (value: any) => void
    onBlur: () => void
    value: any
  }
}


export const RpcSelectorItem = React.memo(
  ({
    index,
    url,
    rpcUrlsLength,
    forceLargeItems,
    selectedRpcUrl,
    shouldShowRemove,
    style,
    onPress,
    onRemove
  }: RpcSelectorItemType) => {
    const { t } = useTranslation()
    const { addToast } = useToast()
    const { styles, theme } = useTheme(getStyles)
    const [hovered, setHovered] = useState(false)
    const [bindCopyIconAnim, copyIconAnimStyle] = useHover({
      preset: 'opacity'
    })

    const handleCopy = useCallback(async () => {
      try {
        await setStringAsync(url)
        addToast(t('Copied to clipboard!'), { timeout: 2500 })
      } catch (error) {
        addToast(t('Failed to copy to clipboard'), { type: 'error' })
      }
    }, [addToast, t, url])

    return (
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <Pressable
          style={[
            styles.selectRpcItem,
            index !== rpcUrlsLength - 1 && styles.selectRpcItemBorder,
            (rpcUrlsLength <= 2 || forceLargeItems) && { height: 40 },
            style,
            hovered && { backgroundColor: theme.tertiaryBackground }
          ]}
          onPress={() => {
            if (url !== selectedRpcUrl) onPress(url)
          }}
        >
          <View
            style={[
              styles.radio,
              selectedRpcUrl === url && styles.radioSelected,
              hovered && styles.radioHovered
            ]}
          >
            {selectedRpcUrl === url && <View style={styles.radioSelectedInner} />}
          </View>
          <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.flex1]}>
            <Text
              fontSize={14}
              appearance={selectedRpcUrl === url ? 'primaryText' : 'secondaryText'}
              numberOfLines={1}
            >
              {url}
            </Text>
            <AnimatedPressable
              onPress={handleCopy}
              style={[spacings.mlMi, copyIconAnimStyle]}
              {...bindCopyIconAnim}
            >
              <CopyIcon width={16} height={16} />
            </AnimatedPressable>
          </View>
          {!!shouldShowRemove && !!hovered && (
            <View style={spacings.plLg}>
              <Pressable onPress={() => !!onRemove && onRemove(url)}>
                {({ hovered: removeButtonHovered }: any) => (
                  <Text
                    fontSize={12}
                    underline
                    color={removeButtonHovered ? theme.errorText : theme.errorDecorative}
                  >
                    {t('Remove')}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
        </Pressable>
      </div>
    )
  }
)

export const RpcProviderSelectorItem = React.memo(
  ({
    index,
    value,
    label,
    isSelected,
    itemsLength,
    disabled,
    onSelect,
    style,
    testID
  }: RpcProviderSelectorItemType) => {
    const { styles, theme } = useTheme(getStyles)
    const [hovered, setHovered] = useState(false)

    return (
      <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <Pressable
          testID={testID}
          style={[
            styles.selectRpcItem,
            index !== itemsLength - 1 && styles.selectRpcItemBorder,
            style,
            hovered && !disabled && { backgroundColor: theme.tertiaryBackground },
            disabled && { opacity: 0.5 }
          ]}
          onPress={() => {
            if (disabled) return
            if (!isSelected) onSelect(value)
          }}
        >
          <View
            style={[
              styles.radio,
              isSelected && styles.radioSelected,
              hovered && !disabled && styles.radioHovered
            ]}
          >
            {!!isSelected && <View style={styles.radioSelectedInner} />}
          </View>
          <Text fontSize={14} weight="medium" appearance="secondaryText">
            {label}
          </Text>
        </Pressable>
      </div>
    )
  }
)

const NetworkForm = ({
  selectedChainId = 'add-custom-network',
  onCancel,
  onSaved
}: {
  selectedChainId?: bigint | string
  onCancel: () => void
  onSaved: () => void
}) => {
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { addToast } = useToast()
  const { allNetworks, networkToAddOrUpdate, statuses } = useNetworksControllerState()
  const [isValidatingRPC, setValidatingRPC] = useState<boolean>(false)
  const { styles } = useTheme(getStyles)

  const selectedNetwork = useMemo(
    () => allNetworks.find((network) => network.chainId.toString() === selectedChainId.toString()),
    [allNetworks, selectedChainId]
  )

  const isPredefinedNetwork = useMemo(
    () => selectedNetwork && selectedNetwork.predefined,
    [selectedNetwork]
  )

  const {
    watch,
    setError,
    clearErrors,
    control,
    handleSubmit,
    setValue,
    formState: { errors, touchedFields }
  } = useForm<NetworkFormValues>({
    mode: 'onSubmit',
    defaultValues: {
      name: '',
      rpcUrl: '',
      consensusRpcUrl: '',
      heliosCheckpoint: '',
      proverRpcUrl: '',
      chainId: '',
      rpcProvider: 'rpc',
      nativeAssetSymbol: '',
      nativeAssetName: '',
      explorerUrl: '',
      coingeckoPlatformId: '',
      coingeckoNativeAssetId: ''
    },
    values: {
      name: selectedNetwork?.name || '',
      rpcUrl: '',
      consensusRpcUrl: selectedNetwork?.consensusRpcUrl || '',
      heliosCheckpoint: selectedNetwork?.heliosCheckpoint || '',
      proverRpcUrl: selectedNetwork?.proverRpcUrl || '',
      chainId: selectedNetwork?.chainId ? selectedNetwork.chainId.toString() : '',
      rpcProvider: selectedNetwork?.rpcProvider || 'rpc',
      nativeAssetSymbol: selectedNetwork?.nativeAssetSymbol || '',
      nativeAssetName: selectedNetwork?.nativeAssetName || '',
      explorerUrl: selectedNetwork?.explorerUrl || '',
      coingeckoPlatformId: (selectedNetwork?.platformId as string) || '',
      coingeckoNativeAssetId: (selectedNetwork?.nativeAssetId as string) || ''
    }
  })
  const [rpcUrls, setRpcUrls] = useState(selectedNetwork?.rpcUrls || [])
  const [selectedRpcUrl, setSelectedRpcUrl] = useState(selectedNetwork?.selectedRpcUrl)
  const networkFormValues = watch()
  const chainIdValue = watch('chainId')
  const rpcProviderValue = watch('rpcProvider') as RpcProviderOptionValue
  const errorCount = Object.keys(errors).length

  const isSomethingUpdated = useMemo(() => {
    if (selectedRpcUrl !== selectedNetwork?.selectedRpcUrl) return true
    return getAreDefaultsChanged({ ...networkFormValues, rpcUrls }, selectedNetwork)
  }, [networkFormValues, rpcUrls, selectedNetwork, selectedRpcUrl])

  const canUseHelios = useMemo(() => !!selectedNetwork?.consensusRpcUrl, [selectedNetwork?.consensusRpcUrl])
  const canUseColibri = useMemo(() => {
    try {
      if (!chainIdValue) return false
      return isColibriSupportedChain(BigInt(chainIdValue))
    } catch {
      return false
    }
  }, [chainIdValue])

  const shouldShowHeliosFields = rpcProviderValue === 'helios'
  const shouldShowColibriFields = rpcProviderValue === 'colibri'

  const features = useMemo(
    () =>
      networkToAddOrUpdate?.info
        ? getFeatures(networkToAddOrUpdate?.info, selectedNetwork)
        : errors.chainId
        ? getFeatures(undefined, selectedNetwork)
        : selectedNetwork?.features || getFeatures(undefined, selectedNetwork),
    [errors.chainId, networkToAddOrUpdate?.info, selectedNetwork]
  )

  useEffect(() => {
    dispatch({
      type: 'SETTINGS_CONTROLLER_RESET_NETWORK_TO_ADD_OR_UPDATE'
    })
  }, [dispatch])

  const validateRpcUrlAndRecalculateFeatures = useCallback(
    async (rpcUrl?: string, chainId?: string | number, type: 'add' | 'change' = 'change') => {
      setValidatingRPC(true)
      if (type === 'change') {
        dispatch({ type: 'SETTINGS_CONTROLLER_RESET_NETWORK_TO_ADD_OR_UPDATE' })
      }
      if (!rpcUrl && !selectedRpcUrl) {
        setValidatingRPC(false)
        return
      }
      if (!rpcUrl && !chainId) {
        setValidatingRPC(false)
        return
      }

      if (rpcUrl && !rpcUrl.startsWith('http')) {
        setValidatingRPC(false)
        setError('rpcUrl', {
          type: 'custom-error',
          message: 'RPC URLs must include the correct HTTP/HTTPS prefix'
        })
        return
      }

      if (rpcUrl && !isValidURL(rpcUrl)) {
        setValidatingRPC(false)
        setError('rpcUrl', { type: 'custom-error', message: 'Invalid RPC URL' })
        return
      }

      if (rpcUrl && rpcUrls.includes(rpcUrl)) {
        setValidatingRPC(false)
        setError('rpcUrl', { type: 'custom-error', message: 'RPC URL already added' })
        return
      }

      try {
        if (!rpcUrl) throw new Error('No RPC URL provided')
        const rpc = getRpcProviderForUI(
          {
            rpcUrls: [rpcUrl],
            chainId: chainId ? BigInt(chainId) : undefined
          },
          dispatch
        )
        const network = await rpc.getNetwork()
        rpc.destroy()

        if (!chainId) {
          chainId = Number(network.chainId).toString()
          setValue('chainId', chainId)
        }

        if (Number(network.chainId) !== Number(chainId) && rpcUrl) {
          setValidatingRPC(false)
          setError('rpcUrl', {
            type: 'custom-error',
            message: `RPC chain id ${network.chainId} does not match ${selectedNetwork?.name} chain id ${chainId}`
          })
          return
        }

        if (
          allNetworks.find((n) => n.chainId === network.chainId) &&
          selectedChainId === 'add-custom-network'
        ) {
          setValidatingRPC(false)
          setError('rpcUrl', {
            type: 'custom-error',
            message: `You already have a network with RPC chain id ${network.chainId}`
          })
          return
        }

        if (
          type === 'change' &&
          (rpcUrl !== selectedNetwork?.selectedRpcUrl ||
            Number(chainId) !== Number(selectedNetwork?.chainId))
        ) {
          if (!rpcUrl) {
            addToast('Invalid RPC url', { type: 'error' })
            return
          }
          dispatch({
            type: 'SETTINGS_CONTROLLER_SET_NETWORK_TO_ADD_OR_UPDATE',
            params: { rpcUrl: rpcUrl as string, chainId: BigInt(chainId) }
          })
        }
        setValidatingRPC(false)
        clearErrors('rpcUrl')
      } catch (error) {
        setValidatingRPC(false)
        setError('rpcUrl', { type: 'custom-error', message: 'Invalid RPC URL' })
      }
    },
    [
      selectedRpcUrl,
      rpcUrls,
      dispatch,
      setError,
      allNetworks,
      selectedChainId,
      selectedNetwork?.selectedRpcUrl,
      selectedNetwork?.chainId,
      selectedNetwork?.name,
      clearErrors,
      setValue,
      addToast
    ]
  )

  useEffect(() => {
    // We can't just validate using a custom validate rule, because getNetwork is async
    // and resetting the form doesn't wait for the validation to finish so we get an error
    // when resetting the form.
    const subscription = watch(
      async (value: Partial<NetworkFormValues>, { name }: { name?: keyof NetworkFormValues }) => {
      if (name && !value[name]) {
        if (
          name !== 'rpcUrl' &&
          name !== 'consensusRpcUrl' &&
          name !== 'heliosCheckpoint' &&
          name !== 'proverRpcUrl'
        ) {
            setError(name, { type: 'custom-error', message: 'Field is required' })
            return
          }
        }

        if (name === 'name') {
          if (
            selectedChainId === 'add-custom-network' &&
            allNetworks.some((n) => n.name.toLowerCase() === value.name?.toLowerCase())
          ) {
            setError('name', {
              type: 'custom-error',
              message: `Network with name: ${value.name} already added`
            })
            return
          }
          clearErrors('name')
        }

        if (name === 'nativeAssetSymbol') {
          clearErrors('nativeAssetSymbol')
        }

        if (name === 'nativeAssetName') {
          clearErrors('nativeAssetName')
        }

        if (name === 'chainId') {
          if (
            selectedChainId === 'add-custom-network' &&
            allNetworks.some((n) => Number(n.chainId) === Number(value.chainId))
          ) {
            setError('chainId', {
              type: 'custom-error',
              message: `Network with chainID: ${value.chainId} already added`
            })
            return
          }
          clearErrors('chainId')
        }

        if (name === 'chainId') {
          await validateRpcUrlAndRecalculateFeatures(undefined, value.chainId)
        }

        if (name === 'explorerUrl') {
          if (!value.explorerUrl) {
            setError('explorerUrl', { type: 'custom-error', message: 'URL cannot be empty' })
            return
          }

          try {
            const url = new URL(value.explorerUrl)
            if (url.protocol !== 'https:') {
              setError('explorerUrl', {
                type: 'custom-error',
                message: 'URL must start with https://'
              })
              return
            }
          } catch {
            setError('explorerUrl', { type: 'custom-error', message: 'Invalid URL' })
            return
          }
          clearErrors('explorerUrl')
        }

        if (name === 'consensusRpcUrl') {
          if (!value.consensusRpcUrl) {
            clearErrors('consensusRpcUrl')
            return
          }

          try {
            const url = new URL(value.consensusRpcUrl)
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
              setError('consensusRpcUrl', {
                type: 'custom-error',
                message: 'URL must start with http:// or https://'
              })
              return
            }
          } catch {
            setError('consensusRpcUrl', { type: 'custom-error', message: 'Invalid URL' })
            return
          }
          clearErrors('consensusRpcUrl')
        }

        if (name === 'heliosCheckpoint') {
          if (!value.heliosCheckpoint) {
            clearErrors('heliosCheckpoint')
            return
          }

          // Validate that the checkpoint is a valid Ethereum block hash
          const blockHashRegex = /^0x[0-9a-fA-F]{64}$/
          if (!blockHashRegex.test(value.heliosCheckpoint)) {
            setError('heliosCheckpoint', {
              type: 'custom-error',
              message: 'Must be a valid 32-byte hex string (0x followed by 64 hex characters)'
            })
            return
          }

          clearErrors('heliosCheckpoint')
        }

        if (name === 'rpcUrl') {
          clearErrors('rpcUrl')
        }
      })

    return () => {
      subscription?.unsubscribe()
    }
  }, [
    selectedChainId,
    allNetworks,
    touchedFields,
    validateRpcUrlAndRecalculateFeatures,
    clearErrors,
    setError,
    watch
  ])

  useEffect(() => {
    if (statuses.addNetwork === 'SUCCESS') {
      addToast('Network successfully added!')
      !!onSaved && onSaved()
    }
  }, [addToast, onSaved, statuses.addNetwork])

  useEffect(() => {
    if (statuses.updateNetwork === 'SUCCESS') {
      addToast(`${selectedNetwork?.name} settings saved!`)
      !!onSaved && onSaved()
    }
  }, [addToast, onSaved, selectedNetwork?.name, statuses.updateNetwork])

  const handleSubmitButtonPress = () => {
    // eslint-disable-next-line prettier/prettier, @typescript-eslint/no-floating-promises
    handleSubmit(async (formFields: any) => {
      let emptyFields: string[] = []

      if (selectedChainId === 'add-custom-network') {
        emptyFields = Object.keys(formFields).filter(
          (key) =>
            ![
              'rpcUrl',
              'rpcUrls',
              'coingeckoPlatformId',
              'coingeckoNativeAssetId',
              'consensusRpcUrl',
              'heliosCheckpoint'
            ].includes(key) && !formFields[key].length
        )
      } else {
        emptyFields = Object.keys(formFields).filter(
          (key) => ['explorerUrl'].includes(key) && !formFields[key].length
        )
      }

      if (!rpcUrls.length)
        setError('rpcUrl', {
          type: 'custom-error',
          message: 'At least one RPC URL should be added'
        })

      emptyFields.forEach((k) => {
        setError(k as any, { type: 'custom-error', message: 'Field is required' })
      })

      if (emptyFields.length || !rpcUrls.length || !selectedRpcUrl) return

      if (selectedChainId === 'add-custom-network') {
        dispatch({
          type: 'MAIN_CONTROLLER_ADD_NETWORK',
          params: {
            ...networkFormValues,
            name: networkFormValues.name,
            nativeAssetSymbol: networkFormValues.nativeAssetSymbol,
            nativeAssetName: networkFormValues.nativeAssetName,
            explorerUrl: networkFormValues.explorerUrl,
            rpcUrls,
            selectedRpcUrl,
            chainId: BigInt(networkFormValues.chainId),
            iconUrls: [],
            rpcProvider: networkFormValues.rpcProvider,
            consensusRpcUrl: networkFormValues.consensusRpcUrl,
            heliosCheckpoint: networkFormValues.heliosCheckpoint,
            proverRpcUrl: networkFormValues.proverRpcUrl
          }
        })
      } else {
        dispatch({
          type: 'MAIN_CONTROLLER_UPDATE_NETWORK',
          params: {
            network: {
              rpcUrls,
              selectedRpcUrl,
              explorerUrl: networkFormValues.explorerUrl,
              consensusRpcUrl: networkFormValues.consensusRpcUrl,
              rpcProvider: networkFormValues.rpcProvider,
              heliosCheckpoint: networkFormValues.heliosCheckpoint,
              proverRpcUrl: networkFormValues.proverRpcUrl
            },
            chainId: BigInt(networkFormValues.chainId)
          }
        })
      }
    })()
  }

  const handleSelectRpcUrl = useCallback(
    (url: string) => {
      if (selectedRpcUrl !== url) {
        setSelectedRpcUrl(url)
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        const chainId = watch('chainId')
        if (chainId) {
          dispatch({
            type: 'SETTINGS_CONTROLLER_SET_NETWORK_TO_ADD_OR_UPDATE',
            params: { rpcUrl: url, chainId: BigInt(chainId) }
          })
        }
      }
    },
    [selectedRpcUrl, dispatch, watch]
  )

  const handleRemoveRpcUrl = useCallback(
    (url: string) => {
      if (
        isPredefinedNetwork &&
        allNetworks.filter((n) => n.predefined).find((n) => n.rpcUrls.includes(url))
      )
        return

      const filteredRpcUrls = rpcUrls.filter((u) => u !== url)
      if (url === selectedRpcUrl) {
        if (filteredRpcUrls.length) {
          handleSelectRpcUrl(filteredRpcUrls[0])
        }
      }
      setRpcUrls(filteredRpcUrls)
    },
    [isPredefinedNetwork, allNetworks, rpcUrls, selectedRpcUrl, handleSelectRpcUrl]
  )

  const handleAddRpcUrl = useCallback(
    async (value: string) => {
      const trimmedVal = value.trim()
      await validateRpcUrlAndRecalculateFeatures(trimmedVal, watch('chainId'), 'add')
      if (!errors.rpcUrl) {
        setRpcUrls((p) => [trimmedVal, ...p])
        if (!rpcUrls.length) {
          handleSelectRpcUrl(trimmedVal)
        }
      }
    },
    [rpcUrls.length, watch, errors, handleSelectRpcUrl, validateRpcUrlAndRecalculateFeatures]
  )

  const isSaveOrAddButtonDisabled = useMemo(
    () =>
      !!errorCount ||
      isValidatingRPC ||
      features.some((f) => f.level === 'loading') ||
      !!features.filter((f) => f.id === 'flagged')[0],
    // errorCount must be a dependency in order to re-calculate the value when
    // errors change. Using errors as a dependency doesn't work
    [errorCount, features, isValidatingRPC]
  )

  return (
    <>
      <View style={styles.modalHeader}>
        {selectedChainId === 'add-custom-network' && (
          <Text
            fontSize={20}
            weight="medium"
            numberOfLines={1}
            style={[text.center, flexbox.flex1]}
          >
            {t('Add custom network')}
          </Text>
        )}
        {selectedChainId !== 'add-custom-network' && !!selectedNetwork && (
          <>
            <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter]}>
              <NetworkIcon
                id={selectedNetwork.chainId.toString()}
                style={spacings.mrTy}
                size={40}
              />
              <Text appearance="secondaryText" weight="regular" style={spacings.mrMi} fontSize={16}>
                {selectedNetwork.name || t('Unknown network')}
              </Text>
            </View>
            <Text fontSize={20} weight="medium" numberOfLines={1}>
              {t('Edit network')}
            </Text>
            <View style={flexbox.flex1} />
          </>
        )}
      </View>
      <View style={[spacings.phXl, spacings.pvXl, spacings.ptLg, flexbox.flex1]}>
        <Text fontSize={18} weight="medium" style={spacings.mbMd}>
          {t('Network details')}
        </Text>
        <View style={[flexbox.directionRow, flexbox.flex1]}>
          <View style={flexbox.flex1}>
            <ScrollableWrapper contentContainerStyle={{ flexGrow: 1 }}>
              <Controller
                control={control}
                render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                  <Input
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    inputWrapperStyle={{ height: 40 }}
                    inputStyle={{ height: 40 }}
                    containerStyle={{ ...spacings.mb, ...spacings.mrMi, flex: 1 }}
                    label={t('Network name')}
                    disabled={selectedChainId !== 'add-custom-network'}
                    error={handleErrors(errors.name)}
                  />
                )}
                name="name"
              />
              <View style={[flexbox.directionRow, flexbox.alignStart]}>
                <Controller
                  control={control}
                  render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                    <Input
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      inputWrapperStyle={{ height: 40 }}
                      inputStyle={{ height: 40 }}
                      containerStyle={{ ...spacings.mb, ...spacings.mlMi, flex: 1 }}
                      label={t('Currency Symbol')}
                      disabled={selectedChainId !== 'add-custom-network'}
                      error={handleErrors(errors.nativeAssetSymbol)}
                    />
                  )}
                  name="nativeAssetSymbol"
                />
                <Controller
                  control={control}
                  render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                    <Input
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      inputWrapperStyle={{ height: 40 }}
                      inputStyle={{ height: 40 }}
                      containerStyle={{ ...spacings.mb, ...spacings.mlMi, flex: 1 }}
                      label={t('Currency Name')}
                      disabled={selectedChainId !== 'add-custom-network'}
                      error={handleErrors(errors.nativeAssetName)}
                    />
                  )}
                  name="nativeAssetName"
                />
              </View>

              <Controller
                control={control}
                render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                  <View style={[flexbox.directionRow, flexbox.alignStart]}>
                    <Input
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      inputWrapperStyle={{ height: 40 }}
                      inputStyle={{ height: 40 }}
                      containerStyle={{ ...spacings.mb, ...spacings.mrTy, flex: 1 }}
                      label={t('Execution RPC URL')}
                      error={handleErrors(errors.rpcUrl)}
                    />
                    <View style={{ paddingTop: 27 }}>
                      <Button
                        text={
                          value.length && !errors.rpcUrl && isValidatingRPC
                            ? t('Adding...')
                            : t('Add')
                        }
                        type="secondary"
                        disabled={
                          !value.length ||
                          (!!errors.rpcUrl &&
                            errors.rpcUrl.message !== 'At least one RPC URL should be added') ||
                          isValidatingRPC
                        }
                        containerStyle={{ height: 40 }}
                        style={{ height: 40 }}
                        onPress={() => handleAddRpcUrl(value)}
                      />
                    </View>
                  </View>
                )}
                name="rpcUrl"
              />

              <Text appearance="secondaryText" fontSize={14} weight="regular" style={spacings.mbMi}>
                {t('Select default execution RPC URL')}
              </Text>
              <ScrollableWrapper
                style={styles.rpcUrlsContainer}
                contentContainerStyle={{ flexGrow: 1 }}
              >
                {!!rpcUrls.length &&
                  rpcUrls.map((url, i) => {
                    return (
                      <RpcSelectorItem
                        key={url}
                        index={i}
                        url={url}
                        selectedRpcUrl={selectedRpcUrl}
                        rpcUrlsLength={rpcUrls.length}
                        onPress={handleSelectRpcUrl}
                        shouldShowRemove={
                          isPredefinedNetwork
                            ? !allNetworks
                              .filter((n) => n.predefined)
                              .find((n) => n.rpcUrls.includes(url))
                            : true
                        }
                        onRemove={handleRemoveRpcUrl}
                      />
                    )
                  })}
                {!rpcUrls.length && (
                  <View
                    style={[
                      flexbox.flex1,
                      flexbox.alignCenter,
                      flexbox.justifyCenter,
                      spacings.pvLg
                    ]}
                  >
                    <Text fontSize={14} style={text.center} appearance="secondaryText">
                      {t('No RPC URLs added yet')}
                    </Text>
                  </View>
                )}
              </ScrollableWrapper>
              <Text appearance="secondaryText" fontSize={14} weight="regular" style={spacings.mbMi}>
                {t('RPC verifier')}
              </Text>
              <View style={[styles.rpcUrlsContainer, spacings.mb]}>
                <RpcProviderSelectorItem
                  index={0}
                  itemsLength={3}
                  value="rpc"
                  label={t('Unverified (not trustless)')}
                  isSelected={rpcProviderValue === 'rpc'}
                  onSelect={(v) => setValue('rpcProvider', v, { shouldDirty: true })}
                  testID="rpc-provider-option-rpc"
                />
                <RpcProviderSelectorItem
                  index={1}
                  itemsLength={3}
                  value="helios"
                  label={t('verified by Helios (LightClient)')}
                  disabled={!canUseHelios}
                  isSelected={rpcProviderValue === 'helios'}
                  onSelect={(v) => setValue('rpcProvider', v, { shouldDirty: true })}
                  testID="rpc-provider-option-helios"
                />
                <RpcProviderSelectorItem
                  index={2}
                  itemsLength={3}
                  value="colibri"
                  label={t('verified by Colibri (Stateless Client)')}
                  disabled={!canUseColibri}
                  isSelected={rpcProviderValue === 'colibri'}
                  onSelect={(v) => setValue('rpcProvider', v, { shouldDirty: true })}
                  testID="rpc-provider-option-colibri"
                />
              </View>
              {shouldShowHeliosFields && (
                <>
                  <View style={[flexbox.flex1]}>
                    <Controller
                      control={control}
                      render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                        <Input
                          onBlur={onBlur}
                          onChangeText={onChange}
                          value={value}
                          inputWrapperStyle={{ height: 40 }}
                          inputStyle={{ height: 40 }}
                          containerStyle={{ ...spacings.mb, flex: 1 }}
                          label={t('Consensus RPC URL')}
                          error={handleErrors(errors.consensusRpcUrl)}
                        />
                      )}
                      name="consensusRpcUrl"
                    />
                  </View>
                  <View style={[flexbox.flex1]}>
                    <Controller
                      control={control}
                      render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                        <Input
                          onBlur={onBlur}
                          onChangeText={onChange}
                          value={value}
                          inputWrapperStyle={{ height: 40 }}
                          inputStyle={{ height: 40 }}
                          containerStyle={{ ...spacings.mb, flex: 1 }}
                          label={t('Weak subjectivity checkpoint')}
                          error={handleErrors(errors.heliosCheckpoint)}
                        />
                      )}
                      name="heliosCheckpoint"
                    />
                  </View>
                </>
              )}
              {shouldShowColibriFields && (
                <View style={[flexbox.flex1]}>
                  <Controller
                    control={control}
                    render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                      <Input
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                        inputWrapperStyle={{ height: 40 }}
                        inputStyle={{ height: 40 }}
                        containerStyle={{ ...spacings.mb, flex: 1 }}
                        label={t('Prover RPC URL')}
                        error={handleErrors(errors.proverRpcUrl)}
                      />
                    )}
                    name="proverRpcUrl"
                  />
                </View>
              )}
              <View style={[flexbox.directionRow, flexbox.alignStart]}>
                <Controller
                  control={control}
                  render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                    <NumberInput
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value as any}
                      inputWrapperStyle={{ height: 40 }}
                      inputStyle={{ height: 40 }}
                      containerStyle={{ ...spacings.mrMi, flex: 1 }}
                      label={t('Chain ID')}
                      disabled={selectedChainId !== 'add-custom-network'}
                      error={handleErrors(errors.chainId)}
                    />
                  )}
                  name="chainId"
                />
                <Controller
                  control={control}
                  render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                    <Input
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      inputWrapperStyle={{ height: 40 }}
                      inputStyle={{ height: 40 }}
                      containerStyle={{ ...spacings.mlMi, flex: 2 }}
                      label={t('Block Explorer URL')}
                      error={handleErrors(errors.explorerUrl)}
                    />
                  )}
                  name="explorerUrl"
                />
              </View>
              <View style={[flexbox.directionRow, flexbox.alignStart]}>
                <Controller
                  control={control}
                  render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                    <NumberInput
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value as any}
                      disabled
                      placeholder="Coming soon..."
                      inputWrapperStyle={{ height: 40 }}
                      inputStyle={{ height: 40 }}
                      containerStyle={{ ...spacings.mrMi, flex: 1 }}
                      label={t('Coingecko platform ID')}
                      error={handleErrors(errors.coingeckoPlatformId)}
                    />
                  )}
                  name="coingeckoPlatformId"
                />
                <Controller
                  control={control}
                  render={({ field: { onChange, onBlur, value } }: ControllerRenderArgs) => (
                    <Input
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      disabled
                      placeholder="Coming soon..."
                      inputWrapperStyle={{ height: 40 }}
                      inputStyle={{ height: 40 }}
                      containerStyle={{ ...spacings.mlMi, flex: 1 }}
                      label={t('Coingecko native asset ID')}
                      error={handleErrors(errors.coingeckoNativeAssetId)}
                    />
                  )}
                  name="coingeckoNativeAssetId"
                />
              </View>
            </ScrollableWrapper>
          </View>
          <View style={[flexbox.flex1, spacings.pl, spacings.ml]}>
            <ScrollableWrapper contentContainerStyle={{ flexGrow: 1 }}>
              <View style={flexbox.flex1}>
                <NetworkAvailableFeatures chainId={selectedNetwork?.chainId} features={features} />
              </View>
            </ScrollableWrapper>
            <View style={[flexbox.alignEnd, spacings.ptXl]}>
              {selectedChainId === 'add-custom-network' ? (
                <Button
                  onPress={handleSubmitButtonPress}
                  text={t('Add network')}
                  disabled={isSaveOrAddButtonDisabled}
                  hasBottomSpacing={false}
                  size="large"
                />
              ) : (
                <View style={[flexbox.directionRow]}>
                  <Button
                    onPress={onCancel}
                    text={t('Cancel')}
                    type="secondary"
                    hasBottomSpacing={false}
                    style={[flexbox.flex1, spacings.mr, { width: 160 }]}
                    size="large"
                  />

                  <Button
                    onPress={handleSubmitButtonPress}
                    text={isSomethingUpdated ? t('Save') : t('No changes')}
                    disabled={!isSomethingUpdated || isSaveOrAddButtonDisabled}
                    style={[spacings.mlMi, flexbox.flex1, { width: 180 }]}
                    hasBottomSpacing={false}
                    size="large"
                  />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
      <Tooltip id="chainId" />
    </>
  )
}

export default React.memo(NetworkForm)
