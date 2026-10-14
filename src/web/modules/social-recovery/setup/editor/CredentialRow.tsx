import React, { useState } from 'react'
import { Pressable, View } from 'react-native'

import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
import Avatar from '@common/components/Avatar'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderShortAddress } from '@web/modules/social-recovery/shared/display'

import { enrollmentOf } from '@web/modules/social-recovery/shared/records'
import { renderFailedTestLine, renderKindName, renderRowChip } from './copy'
import { guardianAddressOf, isEmptySlot, kindOf } from './operations'
import type { CredentialRowProps } from './types'

/**
 * One method of the path: a guardian's short address, its kind, the holder's
 * own label where an enrolled credential carries one, and its chip, with a
 * failed test's line under them. An empty slot shows no address. A press opens
 * the row's method: an empty slot's enrollment, or an enrolled credential's
 * enrolled summary and its test, which needs its kind and its enrollment. A
 * row that opens lights under the pointer and ends with an arrow.
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
  const { theme } = useTheme()
  const [hovered, setHovered] = useState(false)
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
          <>
            <Avatar pfp={address} isSmart={false} size={24} displayTypeBadge={false} />
            <Text fontSize={14} weight="medium" style={spacings.mrTy}>
              {renderShortAddress(address)}
            </Text>
          </>
        )}
        <Text
          fontSize={14}
          weight={address ? 'regular' : 'medium'}
          appearance={address ? 'secondaryText' : 'primaryText'}
          style={spacings.mrTy}
        >
          {renderKindName(kind, t, backup)}
        </Text>
        {!!label && (
          <Text fontSize={14} appearance="secondaryText" style={spacings.mrTy}>
            {label}
          </Text>
        )}
        {!!chip && <StatusChip text={chip} style={{ marginLeft: 'auto' }} />}
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

  if (onPress && (empty || (!!kind && !!enrollment))) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        disabled={disabled}
        style={[
          flexbox.flex1,
          flexbox.directionRow,
          flexbox.alignCenter,
          common.borderRadiusPrimary,
          hovered && !disabled ? { backgroundColor: theme.secondaryBackground } : undefined
        ]}
      >
        <View style={flexbox.flex1}>{content}</View>
        <RightArrowIcon
          color={theme.secondaryText}
          style={spacings.mlTy}
          testID={testID ? `${testID}-opens` : undefined}
        />
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
