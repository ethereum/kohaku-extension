/**
 * The banner of one account over the watcher's record, in the dashboard
 * banner's own component: an open attempt, a failed poll with the open
 * attempt the last good reading holds under it, a record that cannot be read
 * with the hook's retry, or the notice that a recovery handed control to
 * another key. Nothing while the record is read, for an account the watcher
 * has not polled, for an attempt the holder dismissed, or for an attempt a
 * cancel ended. The banner's lines run under its title, along the same
 * coloured edge.
 */
import React, { useCallback, useState } from 'react'
import { View } from 'react-native'

import Banner from '@common/components/Banner'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  renderDateTimeInZone,
  renderFullAddress,
  renderShortAddress
} from '@web/modules/social-recovery/shared/display'

import AttemptLines from './AttemptLines'
import { bannerReadingOf } from './readings'
import type { AccountAttemptBannerProps, AttemptBannerType } from './types'

const WATCHER = 'socialRecovery.watcher'

/** The banner stacks its lines under its title instead of beside it. */
const STACKED = { flexDirection: 'column', alignItems: 'stretch' } as const

const AccountAttemptBanner = ({
  account,
  name,
  useAttempt,
  useDismissed,
  heldKeys,
  onCancel,
  onDismiss,
  onRetry,
  timeZone
}: AccountAttemptBannerProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const state = useAttempt(account)
  const dismissed = useDismissed(account, state)
  const reading = bannerReadingOf(state, dismissed, heldKeys)
  const id = account.toLowerCase()
  const [busy, setBusy] = useState(false)

  const retry = useCallback(() => {
    setBusy(true)
    onRetry(account)
      .catch(() => undefined)
      .finally(() => setBusy(false))
  }, [onRetry, account])

  const executedId = reading.kind === 'executed' ? reading.ending.attemptId : undefined
  const dismissExecuted = useCallback(() => {
    if (executedId === undefined) {
      return
    }
    setBusy(true)
    onDismiss(account, executedId)
      .catch(() => undefined)
      .finally(() => setBusy(false))
  }, [onDismiss, account, executedId])

  if (reading.kind === 'none') {
    return null
  }

  const frame = (
    type: AttemptBannerType,
    title: string,
    text: string | undefined,
    lines: React.ReactNode
  ) => (
    // The common banner takes no test id of its own, so the account's banner is named by this wrapper.
    <View testID={`recovery-banner-${id}`}>
      <Banner type={type} title={title} text={text} style={STACKED}>
        <View
          style={[
            spacings.plSm,
            spacings.prSm,
            spacings.pbSm,
            { borderLeftWidth: 6, borderLeftColor: theme[`${type}Decorative`] as string }
          ]}
        >
          {name !== undefined && (
            <Text
              fontSize={12}
              weight="medium"
              appearance="secondaryText"
              style={spacings.mbTy}
              testID={`recovery-banner-${id}-account`}
            >
              {name
                ? t(`${WATCHER}.banner.account`, { name, address: renderShortAddress(account) })
                : renderShortAddress(account)}
            </Text>
          )}
          {lines}
        </View>
      </Banner>
    </View>
  )

  const retryButton = (onPress: () => void) => (
    <Button
      testID={`recovery-banner-${id}-retry`}
      type="secondary"
      size="small"
      text={t(`${WATCHER}.failed.retry`)}
      onPress={onPress}
      disabled={busy}
      hasBottomSpacing={false}
      style={[flexbox.alignSelfStart, spacings.mbSm]}
    />
  )

  if (reading.kind === 'unreadable') {
    return frame(
      'error',
      t(`${WATCHER}.failed.title`),
      t(`${WATCHER}.failed.body`),
      retryButton(reading.retry)
    )
  }

  if (reading.kind === 'executed') {
    const { ending } = reading
    return frame(
      'warning',
      t(`${WATCHER}.executed.title`),
      ending.at !== undefined
        ? t(`${WATCHER}.executed.body`, {
            date: renderDateTimeInZone(ending.at * 1000, timeZone).date
          })
        : undefined,
      <>
        {!!ending.controller && (
          <View style={spacings.mbTy}>
            <Text fontSize={12} appearance="secondaryText">
              {t(`${WATCHER}.executed.newController`)}
            </Text>
            <Text
              fontSize={14}
              weight="number_medium"
              selectable
              testID={`recovery-banner-${id}-controller`}
            >
              {renderFullAddress(ending.controller)}
            </Text>
          </View>
        )}
        <Button
          testID={`recovery-banner-${id}-executed-dismiss`}
          type="secondary"
          size="small"
          text={t(`${WATCHER}.executed.dismiss`)}
          onPress={dismissExecuted}
          disabled={busy}
          hasBottomSpacing={false}
          style={flexbox.alignSelfStart}
        />
      </>
    )
  }

  if (reading.kind === 'failed') {
    return frame(
      'error',
      t(`${WATCHER}.failed.title`),
      t(`${WATCHER}.failed.body`),
      <>
        {reading.lastBlockAt !== undefined && (
          <Text
            fontSize={14}
            appearance="secondaryText"
            style={spacings.mbTy}
            testID={`recovery-banner-${id}-last-read`}
          >
            {t(`${WATCHER}.failed.lastRead`, {
              date: renderDateTimeInZone(reading.lastBlockAt, timeZone).date
            })}
          </Text>
        )}
        {retryButton(retry)}
        {!!reading.open && (
          <AttemptLines
            open={reading.open}
            titled
            account={account}
            timeZone={timeZone}
            onCancel={onCancel}
            onDismiss={onDismiss}
          />
        )}
      </>
    )
  }

  return frame(
    'warning',
    t(`${WATCHER}.banner.title`),
    undefined,
    <AttemptLines
      open={reading.open}
      titled={false}
      account={account}
      timeZone={timeZone}
      onCancel={onCancel}
      onDismiss={onDismiss}
    />
  )
}

export default React.memo(AccountAttemptBanner)
