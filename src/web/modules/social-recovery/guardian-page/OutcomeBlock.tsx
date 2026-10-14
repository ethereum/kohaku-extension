/**
 * What the page draws in place of the sign action once the request is not
 * live: the recovery the recoverer submitted, waiting until its end or with
 * its waiting period over, or the death that ended the request. Each asks the
 * guardian to tell the owner if anyone still asks for an approval, and closes
 * the page.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { dateOf } from '@web/modules/social-recovery/recovery/checklist'

import type { ApprovalDeath, OutcomeBlockProps } from './types'

const PAGE = 'socialRecovery.guardianPage'

const DEATH_KEYS: Record<ApprovalDeath, { title: string; body: string }> = {
  expired: { title: `${PAGE}.dead.expiredTitle`, body: `${PAGE}.dead.expiredBody` },
  void: { title: `${PAGE}.dead.voidTitle`, body: `${PAGE}.dead.voidBody` },
  'setup-changed': { title: `${PAGE}.dead.changedTitle`, body: `${PAGE}.dead.changedBody` },
  used: { title: `${PAGE}.dead.usedTitle`, body: `${PAGE}.dead.usedBody` }
}

const OutcomeBlock = ({ reading, now, timeZone, onClose }: OutcomeBlockProps) => {
  const { t } = useTranslation()

  const closing = (
    <>
      <Text fontSize={14} style={spacings.mbSm} testID="guardian-tell-owner">
        {t(`${PAGE}.dead.tellOwner`)}
      </Text>
      <Button
        testID="guardian-close"
        type="secondary"
        text={t(`${PAGE}.actions.close`)}
        onPress={onClose}
        hasBottomSpacing={false}
      />
    </>
  )

  if (reading.kind === 'waiting') {
    return (
      <View testID="guardian-waiting">
        <Text fontSize={12} appearance="secondaryText" testID="guardian-waiting-title">
          {t(`${PAGE}.waiting.title`)}
        </Text>
        <Text
          fontSize={16}
          weight="medium"
          style={spacings.mbTy}
          testID="guardian-waiting-headline"
        >
          {t(`${PAGE}.waiting.headline`)}
        </Text>
        <Text fontSize={14} style={spacings.mbSm} testID="guardian-waiting-body">
          {t(reading.endsAt <= now ? `${PAGE}.waiting.bodyEnded` : `${PAGE}.waiting.body`, {
            date: dateOf(reading.endsAt, timeZone)
          })}
        </Text>
        {!reading.authorized && (
          <Alert
            testID="guardian-dormant"
            type="warning"
            size="sm"
            style={spacings.mbSm}
            text={t(`${PAGE}.dormant`)}
          />
        )}
        {closing}
      </View>
    )
  }

  if (reading.kind === 'dead') {
    const keys = DEATH_KEYS[reading.death]
    return (
      <View testID={`guardian-dead-${reading.death}`}>
        <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="guardian-dead-title">
          {t(keys.title)}
        </Text>
        <Text fontSize={14} style={spacings.mbSm} testID="guardian-dead-body">
          {t(keys.body)}
        </Text>
        {closing}
      </View>
    )
  }

  return null
}

export default React.memo(OutcomeBlock)
