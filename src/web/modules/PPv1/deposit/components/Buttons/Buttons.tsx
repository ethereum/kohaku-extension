import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { SignAccountOpError } from '@ambire-common/interfaces/signAccountOp'
import { UserRequest } from '@ambire-common/interfaces/userRequest'
import ButtonWithLoader from '@common/components/ButtonWithLoader/ButtonWithLoader'
import Tooltip from '@common/components/Tooltip'
import flexbox from '@common/styles/utils/flexbox'

type Props = {
  handleSubmitForm: () => void
  proceedBtnText?: string
  signAccountOpErrors: SignAccountOpError[]
  isNotReadyToProceed: boolean
  isLoading?: boolean
  networkUserRequests: UserRequest[]
}

const Buttons: FC<Props> = ({
  signAccountOpErrors,
  proceedBtnText = 'Proceed',
  handleSubmitForm,
  isNotReadyToProceed,
  isLoading,
  networkUserRequests = []
}) => {
  const { t } = useTranslation()

  const oneClickDisabledReason = useMemo(() => {
    if (signAccountOpErrors.length > 0) {
      return signAccountOpErrors[0].title
    }

    return ''
  }, [signAccountOpErrors])

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
          onPress={handleSubmitForm}
          testID="proceed-btn"
        />
      </View>
      <Tooltip content={oneClickDisabledReason} id="proceed-btn-tooltip" />
    </View>
  )
}

export default Buttons
