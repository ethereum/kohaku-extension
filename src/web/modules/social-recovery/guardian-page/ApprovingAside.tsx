/**
 * The cards beside the request: what approving does, what it publishes, that
 * the recovery path goes public and that the link is not to be forwarded;
 * beside a request that can be signed, what the wallet's prompt and a
 * hardware wallet show.
 */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import type { ApprovingAsideProps } from './types'

const PAGE = 'socialRecovery.guardianPage'

const ApprovingAside = ({ walletNotes }: ApprovingAsideProps) => {
  const { t } = useTranslation()

  const line = (text: string, testID: string, last = false) => (
    <Text
      fontSize={12}
      appearance="secondaryText"
      style={last ? undefined : spacings.mbTy}
      testID={testID}
    >
      {text}
    </Text>
  )

  return (
    <>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${PAGE}.aside.approving`)}
        testID="guardian-aside-approving"
      >
        {line(t(`${PAGE}.lead.effect`), 'guardian-lead-effect')}
        {line(t(`${PAGE}.lead.publication`), 'guardian-lead-publication')}
        {line(t(`${PAGE}.lead.pathPublic`), 'guardian-lead-path-public')}
        {line(t(`${PAGE}.lead.noForward`), 'guardian-lead-no-forward', true)}
      </SectionCard>
      {walletNotes && (
        <SectionCard
          tone="muted"
          spacing="item"
          label={t(`${PAGE}.aside.wallet`)}
          testID="guardian-aside-wallet"
        >
          {line(t(`${PAGE}.signing.promptNote`), 'guardian-prompt-note')}
          {line(t(`${PAGE}.signing.hardwareNote`), 'guardian-hardware-note', true)}
        </SectionCard>
      )}
    </>
  )
}

export default React.memo(ApprovingAside)
