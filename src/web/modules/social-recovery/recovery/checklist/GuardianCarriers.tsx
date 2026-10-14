/**
 * A guardian row's one artifact, the link to the approval page, and what
 * carries it: the four values first, how the guardian answers, then open the
 * approval page, copy the link, copy a message with the link and show the QR
 * code, all four locked until every value rendered. The row tells the
 * recoverer to ask for the call rather than place it, and to send the message
 * over a channel they already use. The paste field takes the line the guardian
 * sends back. A complete row shows when this tab added its approval.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { setStringAsync } from '@common/utils/clipboard'

import GuardianValues from './GuardianValues'
import { dateOf } from './lines'
import { approvalLinkOf, openApprovalPage } from './link'
import { messageOf } from './message'
import PasteField from './PasteField'
import type { CopyFeedback, GuardianCarriersProps } from './types'
import { guardianValuesOf } from './values'

const GUARDIAN = 'socialRecovery.checklist.guardian'

const GuardianCarriers = ({
  place,
  request,
  replied,
  open,
  busy,
  addReply,
  support
}: GuardianCarriersProps) => {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null)
  const [qrShown, setQrShown] = useState(false)
  const [qrFailed, setQrFailed] = useState(false)
  const { tabUrl, newKey, removed, retryRemoved, timeZone, addedAt, paste } = support

  const link = useMemo(() => (request ? approvalLinkOf(request, tabUrl) : null), [request, tabUrl])
  useEffect(() => {
    setQrFailed(false)
  }, [link])
  const block = useMemo(
    () => (request ? guardianValuesOf(request, newKey, removed, t) : null),
    [request, newKey, removed, t]
  )
  const unlocked = !!link && !!block?.ready

  const copy = useCallback((what: CopyFeedback['what'], text: string) => {
    setStringAsync(text)
      .then((copied) => setFeedback({ what, copied }))
      .catch(() => setFeedback({ what, copied: false }))
  }, [])

  if (replied) {
    const at = addedAt[place]
    return at === undefined ? null : (
      <Text fontSize={14} style={spacings.mtTy} testID={`checklist-row-${place}-added`}>
        {t(`${GUARDIAN}.added`, { date: dateOf(at, timeZone) })}
      </Text>
    )
  }
  if (!open || !request || !block) {
    return null
  }

  const carrier = (key: string, testID: string, onPress: () => void) => (
    <Button
      testID={testID}
      type="secondary"
      size="small"
      text={t(key)}
      disabled={!unlocked}
      onPress={onPress}
      hasBottomSpacing={false}
      style={[spacings.mrSm, spacings.mbTy]}
    />
  )

  const line = (key: string, testID?: string) => (
    <Text fontSize={14} style={spacings.mbTy} testID={testID}>
      {t(key)}
    </Text>
  )

  return (
    <View testID={`checklist-row-${place}-carriers`}>
      <View style={spacings.mtSm}>
        {line(`${GUARDIAN}.sendMessage`, `checklist-row-${place}-send-message`)}
        {line(`${GUARDIAN}.askCallBack`, `checklist-row-${place}-ask-call-back`)}
        {line(`${GUARDIAN}.readValues`, `checklist-row-${place}-read-values`)}
      </View>
      <GuardianValues
        place={place}
        request={request}
        block={block}
        removed={removed}
        retryRemoved={retryRemoved}
      />
      <View style={spacings.mtSm}>
        {line(`${GUARDIAN}.offlineBlock`, `checklist-row-${place}-how-they-answer`)}
      </View>
      {unlocked && !!link && (
        <Text
          fontSize={12}
          appearance="secondaryText"
          selectable
          numberOfLines={1}
          style={spacings.mtSm}
          testID={`checklist-row-${place}-link`}
        >
          {link}
        </Text>
      )}
      <View style={[flexbox.directionRow, flexbox.wrap, flexbox.alignCenter, spacings.mtSm]}>
        {carrier(`${GUARDIAN}.openPage`, `checklist-row-${place}-open-page`, () => {
          if (link) {
            openApprovalPage(link)
          }
        })}
        {carrier(`${GUARDIAN}.copyLink`, `checklist-row-${place}-copy-link`, () => {
          if (link) {
            copy('link', link)
          }
        })}
        {carrier(`${GUARDIAN}.copyMessage`, `checklist-row-${place}-copy-message`, () => {
          if (link) {
            copy(
              'message',
              messageOf(request, link, t, (at) => dateOf(at, timeZone))
            )
          }
        })}
        {carrier(
          qrShown ? `${GUARDIAN}.hideQr` : `${GUARDIAN}.showQr`,
          `checklist-row-${place}-show-qr`,
          () => {
            setQrFailed(false)
            setQrShown((shown) => !shown)
          }
        )}
      </View>
      {!unlocked && (
        <Text
          fontSize={12}
          appearance="secondaryText"
          style={spacings.mbTy}
          testID={`checklist-row-${place}-unlock-reason`}
        >
          {t(`${GUARDIAN}.unlockReason`)}
        </Text>
      )}
      {!!feedback && (
        <Text
          fontSize={12}
          appearance={feedback.copied ? 'successText' : 'errorText'}
          style={spacings.mbTy}
          testID={`checklist-row-${place}-copy-${feedback.what}-${
            feedback.copied ? 'copied' : 'failed'
          }`}
        >
          {t(feedback.copied ? `${GUARDIAN}.copied` : `${GUARDIAN}.copyFailed`)}
        </Text>
      )}
      {unlocked && qrShown && !qrFailed && !!link && (
        <View style={[flexbox.alignSelfStart, spacings.mbSm]} testID={`checklist-row-${place}-qr`}>
          <QRCode
            value={link}
            size={200}
            quietZone={10}
            ecl="L"
            onError={() => setQrFailed(true)}
          />
        </View>
      )}
      {unlocked && qrShown && qrFailed && (
        <Text
          fontSize={12}
          appearance="errorText"
          style={spacings.mbTy}
          testID={`checklist-row-${place}-qr-failed`}
        >
          {t(`${GUARDIAN}.qrFailed`)}
        </Text>
      )}
      <View style={spacings.mtTy}>
        {line(`${GUARDIAN}.messageSays`)}
        {line(`${GUARDIAN}.ownKey`)}
        {line(`${GUARDIAN}.hardwareWallet`)}
      </View>
      <PasteField place={place} busy={busy} paste={paste} addReply={addReply} />
    </View>
  )
}

export default React.memo(GuardianCarriers)
