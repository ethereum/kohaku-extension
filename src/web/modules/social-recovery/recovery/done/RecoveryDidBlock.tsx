/**
 * What the recovery did: it published the whole path on chain in the clear,
 * the methods it used and that they published their configuration too; every
 * guardian of the path is discoverable where the path holds an address row;
 * a passkey it did not use stays unguessable; a changed rule and changed
 * members make the next setup unlinkable while nothing unpublishes the past,
 * unlinking without a rule change comes later, and that later release never
 * unlinks a passport where the path holds an identity method.
 */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import { usedMethodsOf } from './copy'
import type { RecoveryDidBlockProps } from './types'

const DONE = 'socialRecovery.done'

const RecoveryDidBlock = ({ summary }: RecoveryDidBlockProps) => {
  const { t } = useTranslation()
  const used = usedMethodsOf(summary, t)

  const line = (text: string, testID: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  return (
    <SectionCard testID="done-what">
      <SectionLabel>{t(`${DONE}.whatHeader`)}</SectionLabel>
      {line(t(`${DONE}.published`), 'done-published')}
      {used.length > 0 &&
        line(t(`${DONE}.used`, { methods: used.join(t(`${DONE}.listJoiner`)) }), 'done-used')}
      {used.length > 0 && line(t(`${DONE}.usedPublished`), 'done-used-published')}
      {summary.discoverable && line(t(`${DONE}.discoverable`), 'done-discoverable')}
      {summary.unusedPasskey && line(t(`${DONE}.unusedStays`), 'done-unused-stays')}
      {line(t(`${DONE}.unlinkable`), 'done-unlinkable')}
      {line(t(`${DONE}.laterRelease`), 'done-later-release')}
      {summary.identity && line(t(`${DONE}.passportNever`), 'done-passport-never')}
    </SectionCard>
  )
}

export default React.memo(RecoveryDidBlock)
