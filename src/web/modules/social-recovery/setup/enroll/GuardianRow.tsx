/**
 * The guardian row. The publication line renders before the field; the field
 * takes an address or a name, with light advisory checks that never hold the
 * enrollment or the save. The wallet stores no name for a guardian. The access
 * test signs a challenge on this device through the request queue where the
 * wallet holds the key, or through the offline block, and the row reads not
 * tested until the challenge comes back signed.
 */
import React from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { noteKeyOfOutcome } from '@web/modules/social-recovery/shared/ceremony'
import { PageTitle, SectionCard } from '@web/modules/social-recovery/shared/chrome'

import GuardianAddressField from './GuardianAddressField'
import GuardianChecksBlock from './GuardianChecksBlock'
import GuardianEnrolledSummary from './GuardianEnrolledSummary'
import GuardianTestBlock from './GuardianTestBlock'
import OfflineBlock from './OfflineBlock'
import type { RowProps } from './types'
import useGuardianRow from './useGuardianRow'

const GuardianRow = (props: RowProps) => {
  const { client, deps, enrollment } = props
  const { t } = useTranslation()
  const row = useGuardianRow(props)
  const { address, challenge } = row
  const addNote = row.addOutcome ? noteKeyOfOutcome(row.addOutcome, 'enroll') : null

  return (
    <View testID="enroll-guardian">
      <PageTitle
        title={t('socialRecovery.enroll.guardian.title')}
        lead={t('socialRecovery.enroll.guardian.lead')}
      />
      <SectionCard>
        <Text testID="guardian-publication" fontSize={14} style={spacings.mbSm}>
          {t('socialRecovery.disclosures.guardianPublication')}
        </Text>

        {!enrollment && (
          <GuardianAddressField
            value={row.value}
            setValue={row.setValue}
            paste={row.paste}
            canPaste={!!deps.readClipboard}
            nameCheck={row.nameCheck}
            address={address}
          />
        )}

        {!!enrollment && !!address && (
          <GuardianEnrolledSummary
            enrollment={enrollment}
            address={address}
            resolvedName={row.resolvedName}
          />
        )}

        {!!address && (
          <View testID="guardian-lines" style={spacings.mbSm}>
            <Text testID="guardian-smart-account" fontSize={14} style={spacings.mbTy}>
              {t('socialRecovery.disclosures.smartAccount')}
            </Text>
            <Text testID="guardian-call-back" fontSize={14} style={spacings.mbTy}>
              {t('socialRecovery.enroll.guardian.callBack')}
            </Text>
            <Text testID="guardian-owner-answer" fontSize={14}>
              {t('socialRecovery.enroll.guardian.ownerAnswer')}
            </Text>
          </View>
        )}

        {row.checkLines.length > 0 && <GuardianChecksBlock lines={row.checkLines} />}

        {!enrollment && (
          <View style={flexbox.alignStart}>
            {!!addNote && (
              <Text
                testID="guardian-add-note"
                fontSize={14}
                appearance="errorText"
                style={spacings.mbTy}
              >
                {t(addNote)}
              </Text>
            )}
            <Button
              testID="guardian-add"
              type="primary"
              size="small"
              text={t('socialRecovery.actions.add')}
              disabled={!address || client.status !== 'ready' || row.busy}
              onPress={row.add}
              hasBottomSpacing={false}
            />
          </View>
        )}

        {!!enrollment && (
          <GuardianTestBlock
            enrollment={enrollment}
            testOutcome={row.testOutcome}
            busy={row.busy}
            waiting={row.waiting}
            canTestOffline={!!row.heldKey}
            runTest={row.runTest}
            withdraw={row.withdraw}
          />
        )}

        {!!enrollment && row.offline && !!challenge && (
          <OfflineBlock
            key={challenge.keyTest.message.salt}
            challenge={challenge}
            busy={row.busy}
            onCheck={(signature) => row.check(challenge, signature)}
            saveFile={deps.saveFile}
          />
        )}
      </SectionCard>

      {row.duplicate && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID="guardian-duplicate">
              {t('socialRecovery.editor.duplicate')}
            </Alert.Text>
          }
        />
      )}
      {row.writeFailed && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID="enroll-write-failed">
              {t('socialRecovery.records.writeFailed')}
            </Alert.Text>
          }
        />
      )}
    </View>
  )
}

export default React.memo(GuardianRow)
