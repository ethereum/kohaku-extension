import React, { useMemo } from 'react'
import { View } from 'react-native'

import BatchIcon from '@common/assets/svg/BatchIcon'
import Button from '@common/components/Button'
import ButtonWithLoader from '@common/components/ButtonWithLoader/ButtonWithLoader'
import Tooltip from '@common/components/Tooltip'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import useRequestsControllerState from '@web/hooks/useRequestsControllerState'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import useSignAccountOpControllerState from '@web/hooks/useSignAccountOpControllerState'
import ActionsPagination from '@web/modules/action-requests/components/ActionsPagination'

import getStyles from './styles'

type Props = {
  onReject: () => void
  onAddToCart: () => void
  onSign: () => void
  onSimulate?: () => void
  isSignLoading: boolean
  isSignDisabled: boolean
  isSimulateDisabled?: boolean
  isSimulating?: boolean
  isAddToCartDisplayed: boolean
  isAddToCartDisabled: boolean
  inProgressButtonText: string
  buttonText: string
  buttonTooltipText?: string
}

const Footer = ({
  onReject,
  onAddToCart,
  onSign,
  onSimulate,
  isSignLoading,
  isSignDisabled,
  isSimulateDisabled,
  isSimulating,
  buttonTooltipText,
  isAddToCartDisplayed,
  isAddToCartDisabled,
  inProgressButtonText,
  buttonText
}: Props) => {
  const { t } = useTranslation()
  const { styles, theme } = useTheme(getStyles)
  const { userRequests } = useRequestsControllerState()
  const { account } = useSelectedAccountControllerState()
  const { accountOp } = useSignAccountOpControllerState() || {}
  const chainId = accountOp?.chainId

  const batchCount = useMemo(() => {
    return userRequests.filter((r) => {
      return (
        r.action.kind === 'calls' &&
        r.meta.accountAddr === account?.addr &&
        r.meta.chainId === chainId
      )
    }).length
  }, [account?.addr, userRequests, chainId])

  return (
    <View style={styles.container}>
      <View style={[!isAddToCartDisplayed && flexbox.flex1, flexbox.alignStart]}>
        <Button
          testID="transaction-button-reject"
          type="danger"
          text={t('Reject')}
          onPress={onReject}
          hasBottomSpacing={false}
          size="large"
          disabled={isSignLoading}
          style={{ width: 98 }}
        />
      </View>
      <ActionsPagination />
      <View
        style={[flexbox.directionRow, !isAddToCartDisplayed && flexbox.flex1, flexbox.justifyEnd]}
      >
        {isAddToCartDisplayed && (
          <Button
            testID="queue-and-sign-later-button"
            type="outline"
            accentColor={theme.primary}
            text={
              batchCount > 1
                ? t('Add to batch ({{batchCount}})', {
                    batchCount
                  })
                : t('Start a batch')
            }
            onPress={onAddToCart}
            disabled={isAddToCartDisabled}
            hasBottomSpacing={false}
            style={{ minWidth: 160, ...spacings.ph, ...spacings.mr }}
            size="large"
          >
            <BatchIcon style={spacings.mlTy} />
          </Button>
        )}
        {!!onSimulate && (
          <Button
            testID="transaction-button-simulate"
            type="outline"
            accentColor={theme.primary}
            text={isSimulating ? t('Simulating...') : t('Simulate')}
            onPress={onSimulate}
            disabled={!!isSimulateDisabled || !!isSimulating || isSignLoading}
            hasBottomSpacing={false}
            style={{ minWidth: 100, ...spacings.mrTy }}
            size="large"
          />
        )}
        {/* @ts-ignore */}
        <View dataSet={{ tooltipId: 'sign-button-tooltip' }}>
          <ButtonWithLoader
            testID="transaction-button-sign"
            type="primary"
            disabled={isSignDisabled}
            isLoading={isSignLoading}
            text={isSignLoading ? inProgressButtonText : buttonText}
            onPress={onSign}
            size="large"
          />
        </View>
        {!!buttonTooltipText && <Tooltip content={buttonTooltipText} id="sign-button-tooltip" />}
      </View>
    </View>
  )
}

export default Footer
