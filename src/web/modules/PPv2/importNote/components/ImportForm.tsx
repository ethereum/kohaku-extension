import { getAddress } from 'ethers'
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { View } from 'react-native'

import { Network } from '@ambire-common/interfaces/network'
import { isValidAddress } from '@ambire-common/services/address'
import Alert from '@common/components/Alert/Alert'
import Button from '@common/components/Button'
import CoingeckoConfirmedBadge from '@common/components/CoingeckoConfirmedBadge'
import Input from '@common/components/Input'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import TokenIcon from '@common/components/TokenIcon'
import { useTranslation } from '@common/config/localization'
import spacings, { SPACING_2XL, SPACING_SM } from '@common/styles/spacings'
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

type Props = {
  handleImportSecretNote: () => void
}

const AddTokenBottomSheet: FC<Props> = ({ handleImportSecretNote }) => {
  const { t } = useTranslation()
  const { dispatch } = useBackgroundService()
  const { networks } = useNetworksControllerState()
  const { validTokens, customTokens, temporaryTokens } = usePortfolioControllerState()
  const { portfolio: selectedAccountPortfolio } = useSelectedAccountControllerState()
  const [network] = useState<Network>(
    networks.find((n) => n.chainId.toString() === '1') || networks[0]
  )

  const [showAlreadyInPortfolioMessage, setShowAlreadyInPortfolioMessage] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isAdditionalHintRequested, setAdditionalHintRequested] = useState(false)

  const {
    control,
    watch,
    setError,
    formState: { errors, isSubmitting }
  } = useForm({
    mode: 'all',
    defaultValues: {
      address: ''
    }
  })
  const address = watch('address', '')

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
    <View>
      <Controller
        control={control}
        name="address"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            onBlur={onBlur}
            onChangeText={onChange}
            label={t('Secret Note')}
            placeholder={t('Enter your secret note')}
            value={value}
            inputStyle={spacings.mbSm}
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
            minHeight: 50 // To prevent the bottom sheet from resizing
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
          <View style={[flexbox.alignCenter, flexbox.justifyCenter, { height: 48 }]}>
            <Spinner style={{ width: 18, height: 18 }} />
          </View>
        ) : null}
      </View>
      <Button
        disabled={!address || isSubmitting}
        text={t('Import Secret Note')}
        hasBottomSpacing={false}
        onPress={handleImportSecretNote}
      />
    </View>
  )
}

export default React.memo(AddTokenBottomSheet)
