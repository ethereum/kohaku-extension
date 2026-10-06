import React from 'react'
import { ActivityIndicator } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { MethodRow } from '@web/modules/social-recovery/shared/chrome'

import type { OtherDoorsProps } from './types'

const DOORS = 'socialRecovery.review.doors'

/**
 * The account's other doors, one line after the security stop block: the
 * keys beside the one a recovery removes and the code entries where the
 * wallet can read them, or the line that it could not read them. Where it
 * names the keys without the code entries, it says the wallet cannot see every
 * door. A recovery leaves every door untouched.
 */
const OtherDoors = ({ doors }: OtherDoorsProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID?: string) => (
    <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  if (doors.kind === 'pending') {
    return <ActivityIndicator testID="review-doors-pending" style={spacings.mbTy} />
  }
  if (doors.kind === 'unreadable') {
    return <MethodRow quiet>{line(t(`${DOORS}.unreadable`), 'review-doors')}</MethodRow>
  }
  if (doors.kind === 'none') {
    return <MethodRow quiet>{line(t(`${DOORS}.none`), 'review-doors')}</MethodRow>
  }

  const keys = t(`${DOORS}.keysBeside`, { count: doors.keys })
  return (
    <MethodRow quiet>
      {doors.kind === 'keys'
        ? line(t(`${DOORS}.line`, { doors: keys }), 'review-doors')
        : line(
            t(`${DOORS}.line`, {
              doors: t(`${DOORS}.pair`, {
                codeEntries: t(`${DOORS}.codeEntries`, { count: doors.codeEntries }),
                keys
              })
            }),
            'review-doors'
          )}
      {doors.kind === 'keys' &&
        line(
          t('socialRecovery.review.otherDoors.cannotSeeEveryDoor'),
          'review-doors-cannot-see-every-door'
        )}
      {doors.kind === 'pair' && (
        <>
          {line(t(`${DOORS}.marker`), 'review-doors-marker')}
          {line(t(`${DOORS}.validator`), 'review-doors-validator')}
        </>
      )}
      {line(t(`${DOORS}.untouched`), 'review-doors-untouched')}
    </MethodRow>
  )
}

export default React.memo(OtherDoors)
