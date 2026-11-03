/**
 * The offline block: the typed data carried out by QR, by copy or as a file
 * to a device that never goes online, and the signature brought back by
 * paste, the one way it returns. The block draws the same values, deadline
 * and sentence as the signing step, with the setup and attempt numbers, and
 * its add action stays under the same acknowledgment as the sign action,
 * since a signature made off the page is still an approval the page hands
 * over. A smart account signs on the page and never offline, and the block
 * says so where the request names one.
 */
import React, { useMemo, useState } from 'react'
import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { saveChallengeFile } from '@web/modules/social-recovery/setup/enroll/carriers'
import {
  typedDataFileOf,
  typedDataTextOf
} from '@web/modules/social-recovery/setup/enroll/guardian'
import { SectionCard, SectionLabel } from '@web/modules/social-recovery/shared/chrome'

import AcknowledgmentBox from './AcknowledgmentBox'
import { PAYLOAD_FILE_NAME } from './constants'
import CopyFeedbackLine from './CopyFeedbackLine'
import type { OfflineBlockProps } from './types'
import useCopy from './useCopy'
import ValueBlock from './ValueBlock'

const PAGE = 'socialRecovery.guardianPage'
const OFFLINE = `${PAGE}.offline`

const OfflineBlock = ({
  described,
  values,
  deadline,
  typedData,
  acknowledged,
  onAcknowledged,
  enabled,
  smartAccount,
  busy,
  failure,
  onAdd,
  onBack,
  onDecline
}: OfflineBlockProps) => {
  const { t } = useTranslation()
  const [pasted, setPasted] = useState('')
  const [qrFailed, setQrFailed] = useState(false)
  const { feedback, copy } = useCopy()
  const payload = useMemo(() => (typedData ? typedDataTextOf(typedData) : null), [typedData])
  const { description } = described

  const row = (label: string, value: string, testID: string) => (
    <View style={spacings.mbSm}>
      <SectionLabel>{label}</SectionLabel>
      <Text fontSize={14} weight="number_medium" testID={testID}>
        {value}
      </Text>
    </View>
  )

  return (
    <View testID="guardian-offline">
      <Text fontSize={20} weight="medium" style={spacings.mbTy} testID="guardian-offline-title">
        {t(`${OFFLINE}.title`)}
      </Text>
      <Text fontSize={14} style={spacings.mbSm}>
        {t(`${OFFLINE}.lead`)}
      </Text>
      {smartAccount && (
        <Text fontSize={14} style={spacings.mbSm} testID="guardian-offline-smart-account">
          {t(`${OFFLINE}.smartAccountOnPage`)}
        </Text>
      )}
      <ValueBlock values={values} deadline={deadline} testID="guardian-offline-values" />
      <SectionCard testID="guardian-offline-numbers">
        {row(
          t(`${PAGE}.details.setupNumber`),
          description.setupNonce.toString(),
          'guardian-offline-setup-number'
        )}
        {row(
          t(`${PAGE}.details.attemptNumber`),
          description.attemptId.toString(),
          'guardian-offline-attempt-number'
        )}
        <Text fontSize={14} testID="guardian-offline-check-device">
          {t(`${OFFLINE}.checkDevice`)}
        </Text>
      </SectionCard>
      {!!payload && !!typedData && (
        <SectionCard testID="guardian-offline-payload">
          <SectionLabel>{t(`${OFFLINE}.payloadHeading`)}</SectionLabel>
          {!qrFailed && (
            <View style={[flexbox.alignSelfStart, spacings.mbSm]} testID="guardian-offline-qr">
              <QRCode
                value={payload}
                size={240}
                quietZone={10}
                ecl="L"
                onError={() => setQrFailed(true)}
              />
            </View>
          )}
          <View style={[flexbox.directionRow, flexbox.wrap]}>
            <Button
              testID="guardian-offline-copy-payload"
              type="secondary"
              size="small"
              text={t(`${OFFLINE}.copyPayload`)}
              onPress={() => copy('payload', payload)}
              hasBottomSpacing={false}
              style={[spacings.mrSm, spacings.mbTy]}
            />
            <Button
              testID="guardian-offline-save"
              type="secondary"
              size="small"
              text={t(`${OFFLINE}.saveFile`)}
              onPress={() => saveChallengeFile(typedDataFileOf(typedData, PAYLOAD_FILE_NAME))}
              hasBottomSpacing={false}
              style={spacings.mbTy}
            />
          </View>
          <CopyFeedbackLine feedback={feedback} testID="guardian-offline-copy" />
        </SectionCard>
      )}
      <AcknowledgmentBox acknowledged={acknowledged} onAcknowledged={onAcknowledged} />
      <SectionCard testID="guardian-offline-return">
        <SectionLabel>{t(`${OFFLINE}.returnHeading`)}</SectionLabel>
        <Input
          testID="guardian-offline-signature"
          label={t(`${OFFLINE}.pasteLabel`)}
          placeholder={t(`${OFFLINE}.placeholder`)}
          value={pasted}
          onChangeText={setPasted}
        />
        {!!failure && (
          <Text
            fontSize={14}
            appearance="errorText"
            style={spacings.mbTy}
            testID={`guardian-offline-${failure}`}
          >
            {t(`${OFFLINE}.${failure}`)}
          </Text>
        )}
        <View style={flexbox.alignStart}>
          <Button
            testID="guardian-offline-add"
            type="primary"
            size="small"
            text={t(`${OFFLINE}.add`)}
            disabled={!enabled || busy || !typedData || !pasted.trim()}
            onPress={() => onAdd(pasted)}
            hasBottomSpacing={false}
          />
        </View>
        {!acknowledged && (
          <Text
            fontSize={12}
            appearance="secondaryText"
            style={spacings.mtTy}
            testID="guardian-offline-tick-first"
          >
            {t(`${PAGE}.acknowledgment.tickFirst`)}
          </Text>
        )}
        <Text fontSize={12} appearance="secondaryText" style={spacings.mtSm}>
          {t(`${OFFLINE}.turnsInto`)}
        </Text>
      </SectionCard>
      <Button
        testID="guardian-offline-back"
        type="secondary"
        text={t(`${PAGE}.actions.back`)}
        onPress={onBack}
        hasBottomSpacing={false}
        style={spacings.mbSm}
      />
      <Button
        testID="guardian-decline"
        type="secondary"
        text={t(`${PAGE}.actions.decline`)}
        onPress={onDecline}
        hasBottomSpacing={false}
      />
    </View>
  )
}

export default React.memo(OfflineBlock)
