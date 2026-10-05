/**
 * The Recovery Card screen: the card with the password hidden behind a reveal,
 * the three carriers, and what warns the holder of a recovery they did not
 * start. The first carrier runs at once; every later one asks the extension
 * password first. At the hidden level with no password in memory, after a
 * reload or in a new tab, the password row asks the recovery password again
 * when a saved setup can check it, and otherwise says so and leads back to the
 * privacy step; nothing carries the card meanwhile, since a card without its
 * password cannot start a recovery. While the extension password ask shows,
 * its own answers stand in for the screen's back and continue.
 */
import React, { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'
import { renderHiddenValue, renderPasswordName } from '@web/modules/social-recovery/shared/display'

import CardFace, { CARD_LABEL_COLUMN } from './CardFace'
import { cardFileOf } from './file'
import PrintCardView from './PrintCardView'
import RecoveryPasswordAsk from './RecoveryPasswordAsk'
import type { CarrierAction, RecoveryCard, RecoveryCardViewProps } from './types'

const RecoveryCardView = ({
  account,
  level,
  password,
  missingPassword,
  carriedBefore,
  onCarried,
  carriers,
  renderPasswordAsk,
  onSetPasswordAgain,
  onBack,
  onContinue
}: RecoveryCardViewProps) => {
  const { t } = useTranslation()

  const [revealed, setRevealed] = useState(false)
  const [carriedHere, setCarriedHere] = useState(false)
  const [asking, setAsking] = useState<CarrierAction | null>(null)
  const [printing, setPrinting] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)

  const card: RecoveryCard = useMemo(
    () => ({ account, level, password: level === 'hidden' ? password : undefined }),
    [account, level, password]
  )
  const passwordMissing = level === 'hidden' && !password
  const hidden = renderHiddenValue(t)

  const run = useCallback(
    (action: CarrierAction) => {
      if (action === 'download') {
        carriers.download(cardFileOf(card, t))
      } else {
        setPrinting(true)
      }
      setCarriedHere(true)
      onCarried()
    },
    [carriers, card, t, onCarried]
  )

  const press = useCallback(
    (action: CarrierAction) => {
      if (carriedBefore || carriedHere) {
        setAsking(action)
      } else {
        run(action)
      }
    },
    [carriedBefore, carriedHere, run]
  )

  // The print view is mounted by now; the browser's print blocks until the
  // holder closes it, and the view goes with it.
  useEffect(() => {
    if (!printing) {
      return
    }
    carriers.print()
    setPrinting(false)
  }, [printing, carriers])

  const answer = useMemo(
    () => ({
      onConfirmed: () => {
        const action = asking
        setAsking(null)
        if (action) {
          run(action)
        }
      },
      onCancel: () => setAsking(null)
    }),
    [asking, run]
  )

  let missingBody: ReactNode = null
  if (missingPassword.kind === 'gone') {
    missingBody = (
      <Alert
        type="warning"
        size="sm"
        text={
          <Alert.Text testID="card-password-gone" size="sm" type="warning">
            {t('socialRecovery.card.passwordGone')}
          </Alert.Text>
        }
      >
        <Button
          testID="card-password-gone-action"
          type="secondary"
          size="small"
          hasBottomSpacing={false}
          text={t('socialRecovery.card.passwordGoneAction')}
          onPress={onSetPasswordAgain}
          style={[flexbox.alignSelfStart, spacings.mtSm]}
        />
      </Alert>
    )
  } else if (missingPassword.kind === 'ask') {
    missingBody = <RecoveryPasswordAsk check={missingPassword.check} />
  }

  // While the setup read runs the row holds its label alone.
  const missingPasswordRow = (
    <View testID="card-password" style={[flexbox.directionRow, flexbox.alignStart, spacings.mbSm]}>
      <Text
        fontSize={12}
        weight="semiBold"
        appearance="secondaryText"
        style={[CARD_LABEL_COLUMN, spacings.mtSm]}
      >
        {renderPasswordName('recoveryPassword', t)}
      </Text>
      <View style={flexbox.flex1}>{missingBody}</View>
    </View>
  )

  const heldPasswordRow =
    level === 'hidden' && password ? (
      <View
        testID="card-password"
        style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbSm]}
      >
        <Text fontSize={12} weight="semiBold" appearance="secondaryText" style={CARD_LABEL_COLUMN}>
          {renderPasswordName('recoveryPassword', t)}
        </Text>
        <Text
          testID="card-password-value"
          fontSize={14}
          weight="medium"
          style={[flexbox.flex1, spacings.mrSm]}
          selectable={revealed}
        >
          {revealed ? password : hidden.dots}
        </Text>
        {!revealed && (
          <StatusChip testID="card-password-chip" text={hidden.chip} style={spacings.mrSm} />
        )}
        <Button
          testID="card-reveal"
          type="secondary"
          size="small"
          hasBottomSpacing={false}
          text={revealed ? t('socialRecovery.card.hide') : t('socialRecovery.card.reveal')}
          onPress={() => setRevealed((shown) => !shown)}
        />
      </View>
    ) : null

  const passwordRow = passwordMissing ? missingPasswordRow : heldPasswordRow

  return (
    <View testID="card-screen">
      <PageTitle title={t('socialRecovery.card.title')} lead={t('socialRecovery.card.lead')} />
      <View style={spacings.mbLg}>
        <CardFace account={account} passwordRow={passwordRow} onScreen testID="recovery-card" />
      </View>
      <SectionCard>
        {asking ? (
          <View testID="card-password-ask">{renderPasswordAsk(answer)}</View>
        ) : (
          <>
            <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
              <Button
                testID="card-download"
                type="primary"
                hasBottomSpacing={false}
                text={t('socialRecovery.card.downloadPdf')}
                disabled={passwordMissing}
                onPress={() => press('download')}
                style={spacings.mrSm}
              />
              <Button
                testID="card-print"
                type="secondary"
                hasBottomSpacing={false}
                text={t('socialRecovery.card.print')}
                disabled={passwordMissing}
                onPress={() => press('print')}
                style={spacings.mrSm}
              />
              <Button
                testID="card-send"
                type="secondary"
                hasBottomSpacing={false}
                text={t('socialRecovery.card.sendToDevice')}
                disabled={passwordMissing}
                onPress={() => press('sendToDevice')}
              />
            </View>
            <Text fontSize={12} appearance="secondaryText" style={spacings.mtSm}>
              {t('socialRecovery.card.carrierAsks')}
            </Text>
          </>
        )}
        <Pressable
          testID="card-why"
          accessibilityRole="button"
          accessibilityState={{ expanded: whyOpen }}
          onPress={() => setWhyOpen((open) => !open)}
          style={[flexbox.alignSelfStart, spacings.mtSm]}
        >
          <Text fontSize={14} weight="medium" appearance="primary" underline>
            {t('socialRecovery.card.whyNotOnCard')}
          </Text>
        </Pressable>
        {whyOpen && (
          <Text testID="card-why-body" fontSize={14} style={spacings.mtTy}>
            {t('socialRecovery.card.whyNotOnCardBody')}
          </Text>
        )}
      </SectionCard>
      <SectionCard testID="card-warns" label={t('socialRecovery.card.warnsHeader')}>
        <Text fontSize={14}>{t('socialRecovery.card.banner')}</Text>
      </SectionCard>
      {!asking && (
        <ActionsRow
          primary={
            <Button
              testID="card-continue"
              type="primary"
              hasBottomSpacing={false}
              text={t('socialRecovery.actions.continue')}
              onPress={onContinue}
            />
          }
          secondary={
            <Button
              testID="card-back"
              type="outline"
              hasBottomSpacing={false}
              text={t('socialRecovery.ceremony.backAction')}
              onPress={onBack}
            />
          }
        />
      )}
      {printing && <PrintCardView card={card} />}
    </View>
  )
}

export default React.memo(RecoveryCardView)
