/**
 * The rows the edit adds whose access test this device never ran, each by
 * its name and kind, beside the save in the setup review's own words. It
 * warns and never holds the save.
 */
import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderChip } from '@web/modules/social-recovery/shared/display'
import { kindNameOf, kindOf, pathRowOf } from '@web/modules/social-recovery/setup/review'

import type { NotTestedBlockProps } from './types'

const BLOCKED = 'socialRecovery.review.blocked.notTested'

const NotTestedBlock = ({ untested, enrollments, addressBook }: NotTestedBlockProps) => {
  const { t } = useTranslation()

  return (
    <SectionCard testID="manage-review-not-tested">
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
        <StatusChip text={renderChip('method', 'notTested', t)} style={spacings.mrSm} />
        <Text fontSize={16} weight="medium">
          {t(`${BLOCKED}.title`, { count: untested.length })}
        </Text>
      </View>
      {untested.map(({ credential, clause, member }) => {
        const testID = `manage-review-not-tested-${clause}-${member}`
        const rowName = pathRowOf(credential, enrollments, addressBook, t).name
        const kind = kindOf(credential, addressBook)
        const kindName = kind && kindNameOf(kind, t) !== rowName ? kindNameOf(kind, t) : null
        return (
          <View
            key={testID}
            testID={testID}
            style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}
          >
            <Text fontSize={14} weight="medium" style={spacings.mrTy}>
              {rowName}
            </Text>
            {!!kindName && (
              <Text fontSize={14} appearance="secondaryText">
                {kindName}
              </Text>
            )}
          </View>
        )
      })}
      <Text fontSize={14} appearance="secondaryText">
        {t(`${BLOCKED}.body`)}
      </Text>
    </SectionCard>
  )
}

export default React.memo(NotTestedBlock)
