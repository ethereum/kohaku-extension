import { getAddress } from 'ethers'
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { View } from 'react-native'

import { Network } from '@ambire-common/interfaces/network'
import { isValidAddress } from '@ambire-common/services/address'
import Alert from '@common/components/Alert/Alert'
import BottomSheet from '@common/components/BottomSheet'
import Button from '@common/components/Button'
import CoingeckoConfirmedBadge from '@common/components/CoingeckoConfirmedBadge'
import Input from '@common/components/Input'
import NetworkIcon from '@common/components/NetworkIcon'
import { NetworkIconIdType } from '@common/components/NetworkIcon/NetworkIcon'
import Select from '@common/components/Select'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import TokenIcon from '@common/components/TokenIcon'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import useToast from '@common/hooks/useToast'
import spacings, { SPACING_2XL, SPACING_SM } from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import usePortfolioControllerState from '@web/hooks/usePortfolioControllerState/usePortfolioControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import {
  getTokenEligibility,
  getTokenFromPortfolio,
  getTokenFromTemporaryTokens,
  handleTokenIsInPortfolio
} from '@web/modules/action-requests/screens/WatchTokenRequestScreen/utils'

type NetworkOption = {
  value: string
  label: JSX.Element
  icon: JSX.Element
}

type Props = {
  sheetRef: React.RefObject<any>
  handleClose: () => void
}

const AddTokenBottomSheet: FC<Props> = ({ sheetRef, handleClose }) => {
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { networks } = useNetworksControllerState()
  const { addToast } = useToast()
  const { validTokens, customTokens, temporaryTokens } = usePortfolioControllerState()
  const { portfolio: selectedAccountPortfolio } = useSelectedAccountControllerState()
  const { themeType, theme } = useTheme()
  const [network, setNetwork] = useState<Network>(
    networks.find((n) => n.chainId.toString() === '1') || networks[0]
  )

  const [showAlreadyInPortfolioMessage, setShowAlreadyInPortfolioMessage] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isAdditionalHintRequested, setAdditionalHintRequested] = useState(false)

  const {
    control,
    watch,
    setError,
    reset,
    formState: { errors, isSubmitting }
  } = useForm({
    mode: 'all',
    defaultValues: {
      address: ''
    }
  })
  const address = watch('address', '')

  const handleSetNetworkValue = useCallback(
    (networkOption: NetworkOption) => {
      setNetwork(networks.filter((net) => net.name === networkOption.value)[0])
    },
    [networks]
  )

  const networksOptions: NetworkOption[] = useMemo(
    () =>
      networks.map((n) => ({
        value: n.name,
        label: <Text weight="medium">{t(n.name)}</Text>,
        icon: (
          <NetworkIcon
            key={n.chainId.toString()}
            id={n.chainId.toString()}
            name={n.name as NetworkIconIdType}
          />
        )
      })),
    [t, networks]
  )

  const tokenTypeEligibility = useMemo(
    () => getTokenEligibility({ address }, validTokens, network),
    [validTokens, address, network]
  )

  const isCustomToken = useMemo(
    () =>
      !!customTokens.find(
        ({ address: addr, chainId }) =>
          addr.toLowerCase() === address.toLowerCase() && chainId === network.chainId
      ),
    [customTokens, address, network]
  )
  const temporaryToken = useMemo(
    () => getTokenFromTemporaryTokens(temporaryTokens, { address }, network),
    [temporaryTokens, address, network]
  )

  const portfolioToken = useMemo(
    () => getTokenFromPortfolio({ address }, network, selectedAccountPortfolio),
    [selectedAccountPortfolio, network, address]
  )

  const handleCloseAndReset = useCallback(() => {
    handleClose()
    reset({ address: '' })
    setAdditionalHintRequested(false)
    setIsLoading(false)
    setShowAlreadyInPortfolioMessage(false)
  }, [handleClose, reset])

  const handleAddToken = useCallback(async () => {
    if (!isValidAddress(address) || !network) return

    if (!temporaryToken?.address || !temporaryToken?.symbol || !temporaryToken?.decimals) {
      addToast(
        t(
          'Unable to add the token because the provided token parameters are invalid. Please verify the token details and try again.'
        ),
        { type: 'error' }
      )
      return
    }

    dispatch({
      type: 'PORTFOLIO_CONTROLLER_ADD_CUSTOM_TOKEN',
      params: {
        token: {
          address: temporaryToken.address,
          chainId: network.chainId,
          standard: 'ERC20'
        },
        shouldUpdatePortfolio: true
      }
    })
    addToast(t(`Added token ${address} on ${network.name} to your portfolio`))
    handleCloseAndReset()
  }, [
    address,
    network,
    temporaryToken?.address,
    temporaryToken?.symbol,
    temporaryToken?.decimals,
    dispatch,
    addToast,
    t,
    handleCloseAndReset
  ])

  const handleTokenType = useCallback(() => {
    dispatch({
      type: 'PORTFOLIO_CONTROLLER_CHECK_TOKEN',
      params: { token: { address, chainId: network.chainId } }
    })
  }, [address, dispatch, network.chainId])

  useEffect(() => {
    const handleEffect = async () => {
      if (!address || !network) return
      if (address && !isValidAddress(address)) {
        setError('address', { message: t('Invalid address') })
        return
      }
      // Check if token is already in portfolio
      const isTokenInHints = await handleTokenIsInPortfolio(
        isCustomToken,
        selectedAccountPortfolio,
        network,
        { address }
      )
      if (isTokenInHints) {
        setIsLoading(false)
        setShowAlreadyInPortfolioMessage(true)
        return
      }

      if (!temporaryToken) {
        if (tokenTypeEligibility && !isAdditionalHintRequested) {
          setIsLoading(true)
          dispatch({
            type: 'PORTFOLIO_CONTROLLER_GET_TEMPORARY_TOKENS',
            params: { chainId: network?.chainId, additionalHint: getAddress(address) }
          })
          setAdditionalHintRequested(true)
        } else if (tokenTypeEligibility === undefined) {
          setIsLoading(true)
          handleTokenType()
        }
      }
    }

    handleEffect().catch(() => setIsLoading(false))

    if (tokenTypeEligibility === false || !!temporaryToken) {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, address, network, tokenTypeEligibility, temporaryToken, isAdditionalHintRequested])

  useEffect(() => {
    setShowAlreadyInPortfolioMessage(false) // Reset the state when address changes
    setAdditionalHintRequested(false)
  }, [address, network])

  return (
    <BottomSheet
      id="add-custom-token"
      sheetRef={sheetRef}
      closeBottomSheet={handleCloseAndReset}
      style={{ maxWidth: 520 }}
      backgroundColor={themeType === THEME_TYPES.DARK ? 'secondaryBackground' : 'primaryBackground'}
    >
      <Text
        fontSize={20}
        style={[
          spacings.mb,
          spacings.pb,
          { color: theme.textPrimary, borderBottomWidth: 1, borderBottomColor: '#097DB233' }
        ]}
        weight="medium"
      >
        {t('Add Token')}
      </Text>
      <Select
        setValue={handleSetNetworkValue as any}
        options={networksOptions}
        value={networksOptions.filter((opt) => opt.value === network.name)[0]}
        label={t('Choose Network')}
        containerStyle={spacings.mb}
      />
      <Controller
        control={control}
        name="address"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            onBlur={onBlur}
            onChangeText={onChange}
            label={t('Token Address')}
            placeholder={t('0x...')}
            value={value}
            inputStyle={[spacings.mbSm, { backgroundColor: theme.surfaceInput }]}
            inputWrapperStyle={{ borderColor: 'transparent', borderWidth: 0 }}
            borderWrapperStyle={{ borderRadius: 8, borderWidth: 0 }}
            containerStyle={
              !isAdditionalHintRequested &&
              !temporaryToken &&
              !showAlreadyInPortfolioMessage &&
              !isLoading &&
              tokenTypeEligibility === undefined
                ? { marginBottom: SPACING_SM + SPACING_2XL }
                : spacings.mbSm
            }
            error={errors.address && errors.address.message}
          />
        )}
      />
      <View
        style={[
          spacings.mbXl,
          {
            // minHeight: 50 // To prevent the bottom sheet from resizing
          }
        ]}
      >
        {temporaryToken || portfolioToken ? (
          <View
            style={[
              flexbox.directionRow,
              flexbox.justifySpaceBetween,
              flexbox.alignCenter,
              spacings.phTy,
              spacings.pvTy
            ]}
          >
            <View style={[flexbox.directionRow, flexbox.alignCenter]}>
              <TokenIcon
                containerHeight={32}
                containerWidth={32}
                width={22}
                height={22}
                withContainer
                chainId={network.chainId}
                address={address}
              />
              <Text fontSize={16} style={spacings.mlTy} weight="semiBold">
                {temporaryToken?.symbol || portfolioToken?.symbol}
              </Text>
            </View>
            <View style={flexbox.directionRow}>
              {temporaryToken?.priceIn?.length || portfolioToken?.priceIn?.length ? (
                <CoingeckoConfirmedBadge text="Confirmed" address={address} network={network} />
              ) : null}
            </View>
          </View>
        ) : null}
        {address && tokenTypeEligibility === false ? (
          <Alert
            type="error"
            isTypeLabelHidden
            title={t('This token type is not supported.')}
            style={{ ...spacings.phSm, ...spacings.pvSm }}
          />
        ) : null}

        {address && showAlreadyInPortfolioMessage ? (
          <Alert
            type="warning"
            isTypeLabelHidden
            title={t('This token is already handled in your wallet')}
            style={{ ...spacings.phSm, ...spacings.pvSm }}
          />
        ) : null}

        {isLoading || (isAdditionalHintRequested && !temporaryToken) ? (
          <View
            style={[
              {
                backgroundColor: '#097DB20F',
                borderWidth: 1,
                borderColor: '#097DB226',
                borderRadius: 8,
                ...spacings.phSm,
                ...spacings.pvSm
              }
            ]}
          >
            <Text fontSize={13} style={{ color: theme.muted }}>
              Searching token...
            </Text>
          </View>
        ) : null}
      </View>
      <Button
        disabled={
          showAlreadyInPortfolioMessage ||
          (!temporaryToken && !tokenTypeEligibility) ||
          !isValidAddress(address) ||
          !network ||
          isSubmitting
        }
        text={t('Add Token')}
        hasBottomSpacing={false}
        onPress={handleAddToken}
      />
    </BottomSheet>
  )
}

export default React.memo(AddTokenBottomSheet)
