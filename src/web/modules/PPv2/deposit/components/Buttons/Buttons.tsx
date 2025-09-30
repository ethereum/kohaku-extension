import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { SignAccountOpError } from '@ambire-common/interfaces/signAccountOp'
import { UserRequest } from '@ambire-common/interfaces/userRequest'
import ButtonWithLoader from '@common/components/ButtonWithLoader/ButtonWithLoader'
import Tooltip from '@common/components/Tooltip'
import flexbox from '@common/styles/utils/flexbox'

type Props = {
  handleSubmitForm: (isOneClickMode: boolean) => void
  proceedBtnText?: string
  signAccountOpErrors: SignAccountOpError[]
  isNotReadyToProceed: boolean
  isBridge?: boolean
  isLoading?: boolean
  isLocalStateOutOfSync?: boolean
  networkUserRequests: UserRequest[]
}

const Buttons: FC<Props> = ({
  signAccountOpErrors,
  proceedBtnText = 'Proceed',
  handleSubmitForm,
  isNotReadyToProceed,
  isLoading,
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
    <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifyEnd]}>
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
