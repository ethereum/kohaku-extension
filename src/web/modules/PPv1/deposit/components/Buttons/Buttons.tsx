import React, { FC, ReactNode, useMemo } from 'react'
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
  proceedIcon?: ReactNode
  signAccountOpErrors: SignAccountOpError[]
  isNotReadyToProceed: boolean
  isLoading?: boolean
  networkUserRequests: UserRequest[]
}

const Buttons: FC<Props> = ({
  signAccountOpErrors,
  proceedBtnText = 'Proceed',
  proceedIcon,
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
    <View
      style={[
        flexbox.directionRow,
        flexbox.flex1,
        flexbox.alignCenter,
        flexbox.justifyEnd,
        {
          width: '100%'
        }
      ]}
    >
      <View
        // @ts-ignore
        dataSet={{ tooltipId: 'proceed-btn-tooltip' }}
        style={{
          width: '100%'
        }}
      >
        <ButtonWithLoader
          text={primaryButtonText}
          proceedIcon={proceedIcon}
          disabled={isNotReadyToProceed || isLoading || !!oneClickDisabledReason}
          isLoading={isLoading}
          onPress={handleSubmitForm}
          testID="proceed-btn"
          childrenPosition="left"
          childrenContainerStyle={{
            position: 'relative',
            width: 'auto',
            height: 'auto',
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            paddingRight: 0
          }}
        />
      </View>
      <Tooltip content={oneClickDisabledReason} id="proceed-btn-tooltip" />
    </View>
  )
}

export default Buttons
