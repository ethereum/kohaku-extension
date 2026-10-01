/**
 * The Recovery Card screen: the card with the password hidden behind a reveal,
 * the three carriers, and what warns the holder of a recovery they did not
 * start. The first carrier runs at once; every later one asks the extension
 * password first. At the hidden level with no password in memory, after a
 * reload or in a new tab, the password row says so and leads back to the
 * privacy step, and nothing carries the card, since a card without its
 * password cannot start a recovery. While the ask shows, its own answers
 * stand in for the screen's back and continue.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { renderHiddenValue, renderPasswordName } from '@web/modules/social-recovery/shared/display'

import CardFace from './CardFace'
import { cardFileOf } from './file'
import PrintCardView from './PrintCardView'
import type { CarrierAction, RecoveryCard, RecoveryCardViewProps } from './types'

const RecoveryCardView = ({
  account,
  level,
  password,
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

  const passwordGoneRow = (
    <View testID="card-password" style={spacings.mbSm}>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
        {renderPasswordName('recoveryPassword', t)}
      </Text>
      <Text testID="card-password-gone" fontSize={14} style={spacings.mbSm}>
        {t('socialRecovery.card.passwordGone')}
      </Text>
      <Button
        testID="card-password-gone-action"
        type="secondary"
        size="small"
        hasBottomSpacing={false}
        text={t('socialRecovery.card.passwordGoneAction')}
        onPress={onSetPasswordAgain}
      />
    </View>
  )

  const heldPasswordRow =
    level === 'hidden' && password ? (
      <View testID="card-password" style={spacings.mbSm}>
        <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy}>
          {renderPasswordName('recoveryPassword', t)}
        </Text>
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
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
            <Text
              testID="card-password-chip"
              fontSize={12}
              weight="medium"
              appearance="secondaryText"
              style={spacings.mrSm}
            >
              {hidden.chip}
            </Text>
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
      </View>
    ) : null

  const passwordRow = passwordMissing ? passwordGoneRow : heldPasswordRow

  return (
    <View testID="card-screen">
      <Text fontSize={20} weight="medium" style={spacings.mbSm}>
        {t('socialRecovery.card.title')}
      </Text>
      <Text fontSize={14} style={spacings.mbLg}>
        {t('socialRecovery.card.lead')}
      </Text>
      <View style={spacings.mbLg}>
        <CardFace account={account} passwordRow={passwordRow} testID="recovery-card" />
      </View>
      {asking ? (
        <View testID="card-password-ask" style={spacings.mbSm}>
          {renderPasswordAsk(answer)}
        </View>
      ) : (
        <>
          <View style={[flexbox.directionRow, flexbox.wrap, spacings.mbTy]}>
            <Button
              testID="card-download"
              text={t('socialRecovery.card.downloadPdf')}
              disabled={passwordMissing}
              onPress={() => press('download')}
              style={spacings.mrSm}
            />
            <Button
              testID="card-print"
              type="secondary"
              text={t('socialRecovery.card.print')}
              disabled={passwordMissing}
              onPress={() => press('print')}
              style={spacings.mrSm}
            />
            <Button
              testID="card-send"
              type="secondary"
              text={t('socialRecovery.card.sendToDevice')}
              disabled={passwordMissing}
              onPress={() => press('sendToDevice')}
            />
          </View>
          <Text fontSize={12} appearance="secondaryText" style={spacings.mbLg}>
            {t('socialRecovery.card.carrierAsks')}
          </Text>
        </>
      )}
      <Pressable
        testID="card-why"
        accessibilityRole="button"
        accessibilityState={{ expanded: whyOpen }}
        onPress={() => setWhyOpen((open) => !open)}
        style={spacings.mbTy}
      >
        <Text fontSize={14} weight="medium" appearance="primary">
          {t('socialRecovery.card.whyNotOnCard')}
        </Text>
      </Pressable>
      {whyOpen && (
        <Text testID="card-why-body" fontSize={14} style={spacings.mbSm}>
          {t('socialRecovery.card.whyNotOnCardBody')}
        </Text>
      )}
      <View testID="card-warns" style={spacings.mtLg}>
        <Text
          fontSize={12}
          weight="semiBold"
          appearance="secondaryText"
          style={[spacings.mbTy, { textTransform: 'uppercase', letterSpacing: 1 }]}
        >
          {t('socialRecovery.card.warnsHeader')}
        </Text>
        <Text fontSize={14}>{t('socialRecovery.card.banner')}</Text>
      </View>
      {!asking && (
        <View style={[flexbox.directionRow, spacings.mtLg]}>
          <Button
            testID="card-back"
            type="secondary"
            text={t('socialRecovery.ceremony.backAction')}
            onPress={onBack}
            style={spacings.mrSm}
          />
          <Button
            testID="card-continue"
            text={t('socialRecovery.actions.continue')}
            onPress={onContinue}
          />
        </View>
      )}
      {printing && <PrintCardView card={card} />}
    </View>
  )
}

export default React.memo(RecoveryCardView)
