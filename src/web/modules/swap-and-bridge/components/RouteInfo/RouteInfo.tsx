import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { EstimationStatus } from '@ambire-common/controllers/estimation/types'
import { SwapAndBridgeFormStatus } from '@ambire-common/controllers/swapAndBridge/swapAndBridge'
import { FEE_PERCENT } from '@ambire-common/services/socket/constants'
import InfoIcon from '@common/assets/svg/InfoIcon'
import WarningIcon from '@common/assets/svg/WarningIcon'
import Text from '@common/components/Text'
import Tooltip from '@common/components/Tooltip'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import formatTime from '@common/utils/formatTime'
import useInviteControllerState from '@web/hooks/useInviteControllerState'
import useSwapAndBridgeControllerState from '@web/hooks/useSwapAndBridgeControllerState'
import SelectRoute from './SelectRoute'

type Props = {
  isEstimatingRoute: boolean
  shouldEnableRoutesSelection: boolean
  isAutoSelectRouteDisabled: boolean
  openRoutesModal: () => void
}

const RouteInfo: FC<Props> = ({
  isEstimatingRoute,
  shouldEnableRoutesSelection,
  isAutoSelectRouteDisabled,
  openRoutesModal
}) => {
  const { formStatus, signAccountOpController, quote, swapSignErrors, errors } =
    useSwapAndBridgeControllerState()
  const { isOG } = useInviteControllerState()
  const { theme } = useTheme()
  const { t } = useTranslation()

  const noRoutesFoundError = errors.find(({ id }) => id === 'no-routes')?.title

  return (
    <View
      style={[
        flexbox.directionRow,
        flexbox.alignCenter,
        flexbox.justifySpaceBetween,
        {
          height: 25 // Prevents layout shifts
        },
        spacings.mbLg
      ]}
    >
      {swapSignErrors.length > 0 && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, { maxWidth: '100%' }]}>
          <WarningIcon width={14} height={14} color={theme.warningDecorative} />
          <Text fontSize={14} weight="medium" appearance="warningText" style={spacings.mlMi}>
            {swapSignErrors[0].title}
          </Text>
        </View>
      )}
      {swapSignErrors.length === 0 && formStatus === SwapAndBridgeFormStatus.NoRoutesFound && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, { maxWidth: '100%' }]}>
          <WarningIcon width={14} height={14} color={theme.warningDecorative} />
          <Text fontSize={14} weight="medium" appearance="warningText" style={spacings.mlMi}>
            {noRoutesFoundError
              ? t(`No routes found. Reason: ${noRoutesFoundError}`)
              : t('No routes found, please try again by changing the amount')}
          </Text>
        </View>
      )}
      {swapSignErrors.length === 0 &&
        [
          SwapAndBridgeFormStatus.InvalidRouteSelected,
          SwapAndBridgeFormStatus.ReadyToEstimate,
          SwapAndBridgeFormStatus.ReadyToSubmit,
          SwapAndBridgeFormStatus.Proceeded
        ].includes(formStatus) &&
        (signAccountOpController?.estimation.status === EstimationStatus.Success ||
          (signAccountOpController?.estimation.status === EstimationStatus.Error &&
            isAutoSelectRouteDisabled)) &&
        !isEstimatingRoute && (
          <>
            {signAccountOpController?.estimation.status === EstimationStatus.Success && (
              <View
                style={[
                  flexbox.directionRow,
                  flexbox.alignCenter,
                  flexbox.justifySpaceBetween,
                  { width: '100%' }
                ]}
              >
                <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                  <Text appearance="tertiaryText" fontSize={14} weight="medium">
                    {t('Ambire fee: {{fee}}', {
                      fee: isOG ? "0% - you're an OG 🎉" : `${FEE_PERCENT}%`
                    })}
                  </Text>
                  {quote?.selectedRoute?.serviceTime ? (
                    <Text
                      appearance="tertiaryText"
                      fontSize={14}
                      weight="medium"
                      style={spacings.mlLg}
                    >
                      {t('Time: {{time}}', {
                        time:
                          quote?.selectedRoute.fromChainId !== quote?.selectedRoute.toChainId
                            ? `~ ${formatTime(quote?.selectedRoute?.serviceTime)}`
                            : 'instant'
                      })}
                    </Text>
                  ) : null}
                </View>

                <SelectRoute
                  shouldEnableRoutesSelection={shouldEnableRoutesSelection}
                  openRoutesModal={openRoutesModal}
                />
              </View>
            )}
            {signAccountOpController?.estimation.status === EstimationStatus.Error && (
              <View
                style={[
                  flexbox.directionRow,
                  flexbox.alignCenter,
                  flexbox.justifySpaceBetween,
                  { width: '100%' }
                ]}
              >
                <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                  <WarningIcon width={14} height={14} color={theme.warningDecorative} />
                  <Text
                    fontSize={14}
                    weight="medium"
                    appearance="warningText"
                    style={spacings.mlMi}
                  >
                    Estimation error encountered. More details:
                  </Text>
                  <InfoIcon
                    width={16}
                    height={16}
                    data-tooltip-id="bridge-fee-icon"
                    style={spacings.mlTy}
                  />
                  <Tooltip id="bridge-fee-icon" clickable>
                    <View>
                      <Text fontSize={14} appearance="secondaryText" style={spacings.mbMi}>
                        {signAccountOpController?.estimation.error?.message}
                      </Text>
                    </View>
                  </Tooltip>
                </View>

                <SelectRoute
                  shouldEnableRoutesSelection={shouldEnableRoutesSelection}
                  openRoutesModal={openRoutesModal}
                />
              </View>
            )}
          </>
        )}
    </View>
  )
}

export default RouteInfo
