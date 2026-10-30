/**
 * A session a wipe ended, rendered from the reason it keeps and nothing else:
 * its title and body, that nothing was submitted, and the way on each reason
 * gives. An expired request is gathered again whole, or afresh where no
 * approval was given. A request another attempt voided names the slot that
 * attempt holds and who clears it, and offers no new gathering until a poll
 * reads the slot free. A changed setup is read again at the readout.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, PageTitle } from '@web/modules/social-recovery/shared/chrome'
import { WIPE_REASON_STRING_KEYS } from '@web/modules/social-recovery/shared/records'

import { dateOf } from './lines'
import PollAlert from './PollAlert'
import type { WipedBlockProps } from './types'

const DEATHS = 'socialRecovery.checklist.deaths'

const WipedBlock = ({
  session,
  timeZone,
  busy,
  failed,
  onGatherAgain,
  hadReplies,
  slot,
  onRetryPoll,
  onReadSetupAgain
}: WipedBlockProps) => {
  const { t } = useTranslation()
  const keys = WIPE_REASON_STRING_KEYS[session.reason]
  const deadline = session.deadline !== undefined ? Number(session.deadline) * 1000 : NaN
  const voided = session.reason === 'another-attempt-opened'
  const slotFree = voided && slot === 'free'
  // A changed setup offers only to read the setup again, so a failure there
  // is that read's; every other reason's failure is the new gathering's.
  const readsSetupAgain = session.reason === 'setup-changed'

  const line = (key: string, testID: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {t(key)}
    </Text>
  )

  const action = (key: string, testID: string, onPress: () => void) => (
    <ActionsRow
      primary={
        <Button
          testID={testID}
          type="primary"
          text={t(key)}
          disabled={busy}
          onPress={onPress}
          hasBottomSpacing={false}
        />
      }
    />
  )

  const way = () => {
    switch (session.reason) {
      case 'deadline-passed': {
        const afresh = hadReplies === false
        return (
          <>
            {afresh
              ? line(`${DEATHS}.expiredNoApproval`, 'checklist-expired-afresh')
              : line(`${DEATHS}.expiredRegather`, 'checklist-expired-regather')}
            {action(
              afresh ? `${DEATHS}.startNewRequest` : `${DEATHS}.gatherAgain`,
              'checklist-gather-again',
              onGatherAgain
            )}
          </>
        )
      }
      case 'another-attempt-opened':
        if (slotFree) {
          return (
            <>
              {line(`${DEATHS}.slotFreeBody`, 'checklist-slot-free')}
              {action(`${DEATHS}.gatherAgain`, 'checklist-gather-again', onGatherAgain)}
            </>
          )
        }
        return (
          <>
            {line(`${DEATHS}.voidSlot`, 'checklist-void-slot')}
            {line(`${DEATHS}.voidCannotSubmit`, 'checklist-void-cannot-submit')}
            {line(`${DEATHS}.voidReopen`, 'checklist-void-reopen')}
          </>
        )
      case 'setup-changed':
        return action(`${DEATHS}.readSetupAgain`, 'checklist-read-setup-again', onReadSetupAgain)
      default:
        return action(`${DEATHS}.gatherAgain`, 'checklist-gather-again', onGatherAgain)
    }
  }

  return (
    <View testID="checklist-wiped">
      {!!keys && (
        <PageTitle
          title={slotFree ? t(`${DEATHS}.slotFreeTitle`) : t(keys.title)}
          lead={t(keys.body, {
            deadline: Number.isFinite(deadline) ? dateOf(deadline, timeZone) : ''
          })}
          titleTestID="checklist-wiped-title"
        />
      )}
      {voided && slot === 'failed' && <PollAlert withRows={false} onRetry={onRetryPoll} />}
      <Text fontSize={14} style={spacings.mbSm} testID="checklist-wiped-note">
        {t('socialRecovery.records.wipedNote')}
      </Text>
      {failed && (
        <Alert
          testID="checklist-gather-again-failed"
          type="error"
          size="sm"
          style={spacings.mbSm}
          title={
            readsSetupAgain
              ? t(`${DEATHS}.readSetupFailed`)
              : t('socialRecovery.client.unavailableTitle')
          }
          text={readsSetupAgain ? undefined : t('socialRecovery.client.unavailableBody')}
        />
      )}
      {way()}
    </View>
  )
}

export default React.memo(WipedBlock)
