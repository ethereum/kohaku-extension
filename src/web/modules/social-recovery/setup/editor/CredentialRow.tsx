import React from 'react'
import { Pressable, View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { renderShortAddress } from '@web/modules/social-recovery/shared/display'

import { renderFailedTestLine, renderKindName, renderRowChip } from './copy'
import { enrollmentOf, guardianAddressOf, isEmptySlot, kindOf } from './operations'
import type { CredentialRowProps } from './types'

/**
 * One method of the path: a guardian's short address, its kind, the holder's
 * own label where an enrolled credential carries one, and its chip, with a
 * failed test's line under them. An empty slot shows no address and opens the
 * picker when pressed.
 */
const CredentialRow = ({
  credential,
  addressBook,
  enrollments,
  onPress,
  disabled,
  testID
}: CredentialRowProps) => {
  const { t } = useTranslation()
  const kind = kindOf(credential, addressBook)
  const empty = isEmptySlot(credential)
  const chip = renderRowChip(credential, enrollments, t)
  const label = !empty && credential.label ? credential.label : null
  const address = !empty && kind === 'ecdsa' ? guardianAddressOf(credential) : undefined
  const enrollment = empty ? undefined : enrollmentOf(credential, enrollments)
  const backup = enrollment?.backup
  const failedLine = enrollment ? renderFailedTestLine(enrollment, t) : null

  const content = (
    <View>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
        {!!address && (
          <Text fontSize={14} weight="medium" style={spacings.mrTy}>
            {renderShortAddress(address)}
          </Text>
        )}
        <Text fontSize={14} weight="medium" style={spacings.mrTy}>
          {renderKindName(kind, t, backup)}
        </Text>
        {!!label && (
          <Text fontSize={14} style={spacings.mrTy}>
            {label}
          </Text>
        )}
        {!!chip && (
          <Text fontSize={12} weight="medium" appearance="secondaryText">
            {chip}
          </Text>
        )}
      </View>
      {!!failedLine && (
        <Text
          fontSize={12}
          appearance="errorText"
          style={spacings.mtMi}
          testID={testID ? `${testID}-test-line` : undefined}
        >
          {failedLine}
        </Text>
      )}
    </View>
  )

  if (empty && onPress) {
    return (
      <Pressable testID={testID} onPress={onPress} disabled={disabled} style={flexbox.flex1}>
        {content}
      </Pressable>
    )
  }
  return (
    <View testID={testID} style={flexbox.flex1}>
      {content}
    </View>
  )
}

export default React.memo(CredentialRow)
