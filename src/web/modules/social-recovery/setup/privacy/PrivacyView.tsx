/**
 * The privacy step: Private, the default, Shape visible and Public, each with
 * the line of what a stranger can read, and the exposure line of the path. At
 * Private and Shape visible the recovery password is typed twice beside both
 * halves of the trade; at Public no password field renders. Continue stores
 * the level and opens the review.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import type { Clause } from '@web/modules/social-recovery/sdk-interfaces'
import {
  addressBookOf,
  privacyLevelOf,
  recoveryChainOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { renderPasswordName } from '@web/modules/social-recovery/shared/display'
import { readRecoveryPassword } from '@web/modules/social-recovery/shared/records'
import { renderShapeSentence } from '@web/modules/social-recovery/shared/rule-lines'

import { exposureLinesOf, kindOfMethodIn } from './exposure'
import type { OfferedLevel, PrivacyViewProps } from './types'
import { writePrivacy } from './writes'

const LEVEL = 'socialRecovery.privacy.level'

/** The levels this step offers, from the most hidden to the most readable, the default first. */
const OFFERED_LEVELS: readonly OfferedLevel[] = ['private', 'shape-visible', 'public']

/** The slug each level's strings sit under. */
const LEVEL_SLUGS: Readonly<Record<OfferedLevel, string>> = {
  private: 'private',
  'shape-visible': 'shapeVisible',
  public: 'public'
}

const PrivacyView = ({ records, chainId, account, navigate }: PrivacyViewProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  const [picked, setPicked] = useState<OfferedLevel>('private')
  const [clauses, setClauses] = useState<Clause[]>([])
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [writeFailed, setWriteFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  const setup = useMemo(() => records.setup(chainId, account), [records, chainId, account])
  const book = useMemo(
    () => addressBookOf(recoveryChainOf(chainId) ?? WALLET_RECOVERY_CHAIN),
    [chainId]
  )

  useEffect(() => {
    let current = true
    setLoaded(false)
    setup.setupDraft
      .read()
      .then((draft) => {
        if (!current || draft.status !== 'present') {
          return
        }
        setPicked(privacyLevelOf(draft.value.privacy))
        setClauses(draft.value.clauses)
      })
      .catch(() => {
        if (current) {
          setLoadFailed(true)
        }
      })
      .finally(() => {
        if (current) {
          setLoaded(true)
        }
      })
    // The holder keeps the password this tab typed; a reload asks for it again.
    const held = readRecoveryPassword(chainId, account)
    if (held !== undefined) {
      setPassword(held)
      setConfirmation(held)
    }
    return () => {
      current = false
    }
  }, [setup, chainId, account])

  const shape = useMemo(
    () =>
      renderShapeSentence(
        clauses,
        { skipMemberlessClauses: true, kindOfMethod: kindOfMethodIn(book) },
        t
      ),
    [clauses, book, t]
  )

  // A path with no member has no shape to publish, so Shape visible is not
  // offered, and a level stored as Shape visible for such a path opens on Private.
  const offeredLevels = useMemo(
    () => OFFERED_LEVELS.filter((offered) => offered !== 'shape-visible' || shape !== ''),
    [shape]
  )
  const level: OfferedLevel = offeredLevels.includes(picked) ? picked : 'private'

  const exposure = useMemo(
    () => exposureLinesOf(clauses, level, book, t),
    [clauses, level, book, t]
  )

  const hidden = level !== 'public'
  const mismatch = hidden && confirmation !== '' && password !== confirmation
  // Continue is held until the stored draft is read, so the default never
  // replaces a stored level, and after a failed load, so a storage that comes
  // back is never overwritten with a level the holder did not pick.
  const ready = loaded && !loadFailed && (!hidden || (password !== '' && password === confirmation))

  const onContinue = useCallback(async () => {
    if (!ready) {
      return
    }
    setBusy(true)
    try {
      await writePrivacy(
        setup,
        chainId,
        account,
        level === 'public' ? { level } : { level, password }
      )
      setWriteFailed(false)
      navigate(WEB_ROUTES.socialRecoverySetupReview)
    } catch {
      setWriteFailed(true)
    } finally {
      setBusy(false)
    }
  }, [ready, setup, chainId, account, level, password, navigate])

  const radioStyle = (selected: boolean) => [
    spacings.ph,
    spacings.pv,
    spacings.mbSm,
    common.borderRadiusPrimary,
    { borderWidth: 1, borderColor: selected ? theme.primary : theme.secondaryBorder }
  ]

  return (
    <View testID="privacy-screen">
      <Text fontSize={20} weight="medium" style={spacings.mbSm}>
        {t(`${LEVEL}.title`)}
      </Text>
      <Text fontSize={14} style={spacings.mbLg}>
        {t(`${LEVEL}.lead`)}
      </Text>
      {loadFailed && (
        <Text testID="load-failed" fontSize={14} appearance="errorText" style={spacings.mbSm}>
          {t('socialRecovery.records.loadFailed')}
        </Text>
      )}
      <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mbSm}>
        {t(`${LEVEL}.header`)}
      </Text>
      {offeredLevels.map((offered) => (
        <Pressable
          key={offered}
          testID={`level-${offered}`}
          accessibilityRole="radio"
          accessibilityState={{ checked: level === offered }}
          disabled={!loaded}
          // The web renderer reads the checked state of a radio from this prop
          // alone; the React Native types do not declare it, so it goes in a spread.
          {...{ accessibilityChecked: level === offered }}
          onPress={() => setPicked(offered)}
          style={radioStyle(level === offered)}
        >
          <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
            <Text fontSize={16} weight="semiBold" style={spacings.mrSm}>
              {t(`${LEVEL}.${LEVEL_SLUGS[offered]}.label`)}
            </Text>
            {offered === 'private' && (
              <Text fontSize={12} weight="medium" appearance="secondaryText">
                {t(`${LEVEL}.private.badge`)}
              </Text>
            )}
          </View>
          <Text testID={`level-line-${offered}`} fontSize={14}>
            {t(`${LEVEL}.${LEVEL_SLUGS[offered]}.line`, { shape })}
          </Text>
        </Pressable>
      ))}
      <View testID="exposure" style={[spacings.mtSm, spacings.mbLg]}>
        {!!exposure.guardians && (
          <Text testID="exposure-guardians" fontSize={14} style={spacings.mbTy}>
            {exposure.guardians}
          </Text>
        )}
        {!!exposure.unguessable && (
          <Text testID="exposure-unguessable" fontSize={14} style={spacings.mbTy}>
            {exposure.unguessable}
          </Text>
        )}
        <Text testID="exposure-publication" fontSize={14}>
          {exposure.publication}
        </Text>
      </View>
      {hidden ? (
        <View testID="recovery-password">
          <Text fontSize={12} weight="medium" appearance="secondaryText">
            {renderPasswordName('recoveryPassword', t)}
          </Text>
          <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
            {t(`${LEVEL}.requiredAtPrivate`)}
          </Text>
          <InputPassword
            testID="password"
            label={t(`${LEVEL}.passwordLabel`)}
            value={password}
            disabled={!loaded}
            onChangeText={setPassword}
          />
          <InputPassword
            testID="password-confirmation"
            label={t(`${LEVEL}.confirmLabel`)}
            value={confirmation}
            disabled={!loaded}
            onChangeText={setConfirmation}
          />
          {mismatch && (
            <Text testID="mismatch" fontSize={14} appearance="errorText" style={spacings.mbSm}>
              {t(`${LEVEL}.mismatch`)}
            </Text>
          )}
          <Text testID="trade-card" fontSize={14} style={spacings.mbTy}>
            {t(`${LEVEL}.tradeCard`)}
          </Text>
          <Text testID="trade-loss" fontSize={14} style={spacings.mbTy}>
            {t(`${LEVEL}.tradeLoss`)}
          </Text>
          <Text fontSize={12} appearance="secondaryText" style={spacings.mbLg}>
            {t(`${LEVEL}.unlockLine`)}
          </Text>
        </View>
      ) : (
        <Text testID="public-line" fontSize={14} style={spacings.mbLg}>
          {t(`${LEVEL}.publicLine`)}
        </Text>
      )}
      {writeFailed && (
        <Text testID="write-failed" fontSize={14} appearance="errorText" style={spacings.mbSm}>
          {t('socialRecovery.records.writeFailed')}
        </Text>
      )}
      <View style={[flexbox.directionRow, spacings.mtSm]}>
        <Button
          testID="back"
          type="outline"
          text={t('socialRecovery.ceremony.backAction')}
          disabled={busy}
          onPress={() => navigate(WEB_ROUTES.socialRecoverySetupWaitingPeriod)}
          style={spacings.mrSm}
        />
        <Button
          testID="continue"
          text={t('socialRecovery.actions.continue')}
          disabled={!ready || busy}
          onPress={onContinue}
        />
      </View>
    </View>
  )
}

export default React.memo(PrivacyView)
