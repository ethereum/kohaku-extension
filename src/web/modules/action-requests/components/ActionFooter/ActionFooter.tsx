import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleProp, View, ViewStyle } from 'react-native'

import Button, { Props as ButtonProps } from '@common/components/Button'
import Tooltip from '@common/components/Tooltip'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import ActionsPagination from '../ActionsPagination'

type Props = {
  onReject: () => void
  onResolve: () => void
  rejectButtonText?: string
  resolveButtonText: string
  resolveDisabled: boolean
  resolveType?: ButtonProps['type']
  rejectButtonTestID?: string
  resolveButtonTestID?: string
  commonBtnStyle?: StyleProp<ViewStyle>
}

const ActionFooter = ({
  onReject,
  onResolve,
  rejectButtonText,
  resolveButtonText,
  resolveDisabled,
  resolveType = 'primary',
  rejectButtonTestID,
  resolveButtonTestID,
  commonBtnStyle
}: Props) => {
  const { t } = useTranslation()

  // Wrapped on purpose, because the `onResolve` should be called without any arguments
  const handleOnResolve = useCallback(() => onResolve(), [onResolve])

  return (
    <>
      <View style={flexbox.flex1}>
        <Button
          text={rejectButtonText || t('Reject')}
          type="danger"
          hasBottomSpacing={false}
          size="large"
          onPress={onReject}
          testID={rejectButtonTestID}
          style={[flexbox.alignSelfStart, commonBtnStyle]}
        />
      </View>
      <ActionsPagination />
      <View style={flexbox.flex1}>
        <Button
          testID={resolveButtonTestID}
          style={[{ ...spacings.phLg, ...flexbox.alignSelfEnd, minWidth: 128 }, commonBtnStyle]}
          size="large"
          type={resolveType}
          hasBottomSpacing={false}
          onPress={handleOnResolve}
          disabled={resolveDisabled}
          text={resolveButtonText}
        />
      </View>
      <Tooltip id="coming-soon" />
    </>
  )
}

export default React.memo(ActionFooter)
