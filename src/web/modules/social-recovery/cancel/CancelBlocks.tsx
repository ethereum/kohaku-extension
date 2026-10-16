/**
 * The cancel screen's own blocks: the attempt's facts on the confirm, the
 * attempt a read found already ended (nothing sent), and the cancelled
 * terminal with its two defenses, the editor named in a line and moving funds.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import {
  renderDateTimeInZone,
  renderFullAddress,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'
import { cancelGoneRoadKey, WRITES_KEYS } from '@web/modules/social-recovery/shared/writes'

import type { AttemptFactsProps, CancelledBlockProps, EndedBlockProps } from './types'

const BANNER = 'socialRecovery.watcher.banner'
const CANCEL = 'socialRecovery.cancel'

/**
 * The new key in full, then when the attempt finishes or that its execution
 * is due; while the account does not authorize the action the dormant reading
 * stands alone in their place.
 */
export const AttemptFacts = ({ attempt, dormant, timeZone }: AttemptFactsProps) => {
  const { t } = useTranslation()
  const date = renderDateTimeInZone(attempt.consumableAfter * 1000, timeZone).date
  let when: React.ReactNode
  if (dormant) {
    when = (
      <Text fontSize={14} testID="cancel-dormant">
        {t(`${BANNER}.dormant`)}
      </Text>
    )
  } else if (attempt.executionDue) {
    when = (
      <>
        <Text fontSize={12} weight="semiBold" appearance="warningText" testID="cancel-due-chip">
          {t(`${BANNER}.executionDue`)}
        </Text>
        <Text fontSize={14} testID="cancel-due">
          {t(`${BANNER}.dueBody`, { date })}
        </Text>
      </>
    )
  } else {
    when = (
      <Text fontSize={14} testID="cancel-finishes">
        {t(`${BANNER}.finishes`, { date })}
      </Text>
    )
  }
  return (
    <View style={spacings.mbSm} testID="cancel-facts">
      <Text fontSize={12} appearance="secondaryText">
        {renderValueLabel('newKey', t)}
      </Text>
      <Text
        fontSize={14}
        weight="number_medium"
        selectable
        style={spacings.mbTy}
        testID="cancel-new-key"
      >
        {attempt.newKey ? renderFullAddress(attempt.newKey) : t(`${BANNER}.newKeyPending`)}
      </Text>
      {when}
    </View>
  )
}

/**
 * The attempt is gone in the read before any send: nothing was sent. The
 * ending is told only where it is the ending of the attempt the holder meant:
 * the road where the reads named it, the controller after an execution, and,
 * while a road or a controller is still to be read, that the registry has not
 * confirmed it yet, with the action that reads again. While the wallet still
 * holds the cancel's request, only that ending is told.
 */
export const EndedBlock = ({ reading, target, onBack, onCheckAgain, held }: EndedBlockProps) => {
  const { t } = useTranslation()
  const ended =
    reading.ended && (target === undefined || reading.ended.attemptId === target)
      ? reading.ended
      : undefined
  let line: React.ReactNode = null
  if (ended?.road === 'cancelled' && ended.cancelledBy) {
    line = (
      <Text fontSize={14} style={spacings.mbTy} testID="cancel-ended-road">
        {t(cancelGoneRoadKey(ended.cancelledBy))}
      </Text>
    )
  } else if (ended?.road === 'executed' && ended.controller) {
    line = (
      <View style={spacings.mbTy}>
        <Text fontSize={12} appearance="secondaryText">
          {t(WRITES_KEYS.nowControlledBy)}
        </Text>
        <Text fontSize={14} weight="number_medium" selectable testID="cancel-ended-controller">
          {renderFullAddress(ended.controller)}
        </Text>
      </View>
    )
  } else if (ended && !ended.endingGap) {
    line = (
      <>
        <Text
          fontSize={14}
          appearance="secondaryText"
          style={spacings.mbTy}
          testID="cancel-ended-unread"
        >
          {t(`${CANCEL}.landed.unread`)}
        </Text>
        {!!onCheckAgain && (
          <Button
            testID="cancel-ended-check-again"
            type="secondary"
            size="small"
            text={t(`${CANCEL}.landed.checkAgain`)}
            onPress={onCheckAgain}
            hasBottomSpacing={false}
            style={[flexbox.alignSelfStart, spacings.mbTy]}
          />
        )}
      </>
    )
  }
  if (held) {
    return line ? <SectionCard testID="cancel-ended">{line}</SectionCard> : null
  }
  return (
    <SectionCard testID="cancel-ended">
      <Text fontSize={14} style={spacings.mbTy} testID="cancel-ended-line">
        {t(`${CANCEL}.confirm.ended`)}
      </Text>
      {line}
      <Button
        testID="cancel-back"
        type="secondary"
        size="small"
        text={t(`${CANCEL}.confirm.back`)}
        onPress={onBack}
        hasBottomSpacing={false}
        style={[flexbox.alignSelfStart, spacings.mtTy]}
      />
    </SectionCard>
  )
}

/**
 * The cancelled terminal. The owner's cancel ended the attempt it names, by
 * its new key where the reads found it: the methods it used still work, so the
 * terminal points at replacing them, which arrives with a later release, and
 * at moving funds. Another road ended it first: control did not move, so no
 * move-funds action.
 */
export const CancelledBlock = ({
  after,
  onMoveFunds,
  moveFundsBusy,
  onDone
}: CancelledBlockProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard testID="cancel-cancelled">
      <Text
        fontSize={12}
        weight="semiBold"
        appearance="successText"
        style={spacings.mbTy}
        testID="cancel-cancelled-eyebrow"
      >
        {t(`${CANCEL}.cancelled.eyebrow`)}
      </Text>
      {after.stage === 'cancelled' ? (
        <>
          <Text fontSize={16} weight="medium" style={spacings.mbTy} testID="cancel-cancelled-title">
            {t(`${CANCEL}.cancelled.title`)}
          </Text>
          {!!after.newKey && (
            <View style={spacings.mbTy}>
              <Text fontSize={12} appearance="secondaryText">
                {renderValueLabel('newKey', t)}
              </Text>
              <Text
                fontSize={14}
                weight="number_medium"
                selectable
                testID="cancel-cancelled-new-key"
              >
                {renderFullAddress(after.newKey)}
              </Text>
            </View>
          )}
          <Text fontSize={14} style={spacings.mbTy} testID="cancel-cancelled-body">
            {t(`${CANCEL}.cancelled.body`)}
          </Text>
          <Text
            fontSize={14}
            appearance="secondaryText"
            style={spacings.mbTy}
            testID="cancel-cancelled-only-own-key"
          >
            {t(`${BANNER}.onlyOwnKey`)}
          </Text>
          <Text
            fontSize={14}
            appearance="secondaryText"
            style={spacings.mbTy}
            testID="cancel-cancelled-replace-later"
          >
            {t(`${CANCEL}.cancelled.replaceLater`)}
          </Text>
        </>
      ) : (
        <Text fontSize={14} style={spacings.mbTy} testID="cancel-other-road">
          {t(`${CANCEL}.cancelled.otherRoad`, { road: t(cancelGoneRoadKey(after.road)) })}
        </Text>
      )}
      <View style={[flexbox.directionRow, flexbox.wrap, spacings.mtTy]}>
        {after.stage === 'cancelled' && (
          <Button
            testID="cancel-move-funds"
            type="primary"
            size="small"
            text={t(`${CANCEL}.cancelled.moveFunds`)}
            onPress={onMoveFunds}
            disabled={moveFundsBusy}
            hasBottomSpacing={false}
            style={spacings.mrSm}
          />
        )}
        <Button
          testID="cancel-done"
          type="secondary"
          size="small"
          text={t(`${CANCEL}.cancelled.done`)}
          onPress={onDone}
          hasBottomSpacing={false}
        />
      </View>
    </SectionCard>
  )
}
