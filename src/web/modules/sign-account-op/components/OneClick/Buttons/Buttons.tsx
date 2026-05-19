import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { SignAccountOpError } from '@ambire-common/interfaces/signAccountOp'
import { UserRequest } from '@ambire-common/interfaces/userRequest'
import BatchIcon from '@common/assets/svg/BatchIcon'
import Button from '@common/components/Button'
import ButtonWithLoader from '@common/components/ButtonWithLoader/ButtonWithLoader'
import Tooltip from '@common/components/Tooltip'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { getUiType } from '@web/utils/uiType'

type Props = {
  handleSubmitForm: (isOneClickMode: boolean) => void
  proceedBtnText?: string
  signAccountOpErrors: SignAccountOpError[]
  isNotReadyToProceed: boolean
  isBridge?: boolean
  isLoading?: boolean
  isLocalStateOutOfSync?: boolean
  isBatchDisabled?: boolean
  networkUserRequests: UserRequest[]
}

const { isActionWindow } = getUiType()

const Buttons: FC<Props> = ({
  signAccountOpErrors,
  proceedBtnText = 'Proceed',
  handleSubmitForm,
  isNotReadyToProceed,
  isLoading,
  isBatchDisabled,
  isBridge,
  networkUserRequests = [],
  // Used to disable the actions of the buttons when the local state is out of sync.
  // To prevent button flickering when the user is typing we just do nothing when the button is clicked.
  // As it would be a rare case for a user to manage to click it in the 300-400ms that it takes to sync the state,
  // but we still want to guard against it.
  isLocalStateOutOfSync
}) => {
  const { t } = useTranslation()

  const oneClickDisabledReason = useMemo(() => {
    if (signAccountOpErrors.length > 0) {
      return signAccountOpErrors[0].title
    }

    return ''
  }, [signAccountOpErrors])

  const batchDisabledReason = useMemo(() => {
    if (isBridge) return t('Batching is not available for bridges.')

    return ''
  }, [isBridge, t])

  const primaryButtonText = useMemo(() => {
    if (proceedBtnText !== 'Proceed') {
      return proceedBtnText
    }

    return networkUserRequests.length > 0
      ? `${proceedBtnText} ${t('({{count}})', {
          count: networkUserRequests.length
        })}`
      : proceedBtnText
  }, [proceedBtnText, networkUserRequests.length, t])

  return (
    <View
      style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifyEnd, flexbox.flex1]}
    >
      {!isActionWindow && (
        // @ts-ignore
        <View dataSet={{ tooltipId: 'batch-btn-tooltip' }}>
          <Button
            hasBottomSpacing={false}
            text={
              networkUserRequests.length > 0 && !batchDisabledReason
                ? t('Add to batch ({{count}})', {
                    count: networkUserRequests.length
                  })
                : t('Start a batch')
            }
            disabled={isNotReadyToProceed || isBatchDisabled || !!batchDisabledReason}
            type="secondary"
            style={{ minWidth: 160, ...spacings.phMd }}
            onPress={() => {
              if (isLocalStateOutOfSync) return

              handleSubmitForm(false)
            }}
            testID="batch-btn"
          >
            <BatchIcon style={spacings.mlTy} />
          </Button>
        </View>
      )}
      {/* @ts-ignore */}
      <View dataSet={{ tooltipId: 'proceed-btn-tooltip' }}>
        <ButtonWithLoader
          text={primaryButtonText}
          disabled={isNotReadyToProceed || isLoading || !!oneClickDisabledReason}
          isLoading={isLoading}
          onPress={() => {
            if (isLocalStateOutOfSync) return

            handleSubmitForm(true)
          }}
          testID="proceed-btn"
        />
      </View>
      <Tooltip content={oneClickDisabledReason} id="proceed-btn-tooltip" />
      <Tooltip content={batchDisabledReason} id="batch-btn-tooltip" />
    </View>
  )
}

export default Buttons
