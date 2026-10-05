/**
 * The privacy step: Private, the default, Shape visible and Public, each with
 * the line of what a stranger can read, and the exposure line of the path. At
 * Private and Shape visible the recovery password is typed twice beside both
 * halves of the trade; at Public no password field renders. Continue stores
 * the level and opens the review.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import InputPassword from '@common/components/InputPassword'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import type { Clause } from '@web/modules/social-recovery/sdk-interfaces'
import {
  ActionsRow,
  PageTitle,
  RadioCard,
  SectionCard,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'
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

  return (
    <View testID="privacy-screen">
      <PageTitle title={t(`${LEVEL}.title`)} lead={t(`${LEVEL}.lead`)} />
      {loadFailed && (
        <Text testID="load-failed" fontSize={14} appearance="errorText" style={spacings.mbSm}>
          {t('socialRecovery.records.loadFailed')}
        </Text>
      )}
      <SectionCard label={t(`${LEVEL}.header`)}>
        {offeredLevels.map((offered) => (
          <RadioCard
            key={offered}
            testID={`level-${offered}`}
            selected={level === offered}
            disabled={!loaded}
            onPress={() => setPicked(offered)}
          >
            <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbTy]}>
              <Text fontSize={16} weight="medium" style={spacings.mrSm}>
                {t(`${LEVEL}.${LEVEL_SLUGS[offered]}.label`)}
              </Text>
              {offered === 'private' && <StatusChip text={t(`${LEVEL}.private.badge`)} />}
            </View>
            <Text testID={`level-line-${offered}`} fontSize={14}>
              {t(`${LEVEL}.${LEVEL_SLUGS[offered]}.line`, { shape })}
            </Text>
          </RadioCard>
        ))}
        <View testID="exposure" style={spacings.mtTy}>
          {!!exposure.guardians && (
            <Text
              testID="exposure-guardians"
              fontSize={12}
              appearance="secondaryText"
              style={spacings.mbTy}
            >
              {exposure.guardians}
            </Text>
          )}
          {!!exposure.unguessable && (
            <Text
              testID="exposure-unguessable"
              fontSize={12}
              appearance="secondaryText"
              style={spacings.mbTy}
            >
              {exposure.unguessable}
            </Text>
          )}
          <Text testID="exposure-publication" fontSize={12} appearance="secondaryText">
            {exposure.publication}
          </Text>
        </View>
      </SectionCard>
      {hidden ? (
        <View testID="recovery-password">
          <SectionCard label={renderPasswordName('recoveryPassword', t)} spacing="item">
            <Text fontSize={14} style={spacings.mbSm}>
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
            <Text testID="trade-loss" fontSize={14}>
              {t(`${LEVEL}.tradeLoss`)}
            </Text>
          </SectionCard>
          <Text fontSize={12} appearance="secondaryText" style={spacings.mbLg}>
            {t(`${LEVEL}.unlockLine`)}
          </Text>
        </View>
      ) : (
        <SectionCard tone="muted">
          <Text testID="public-line" fontSize={14}>
            {t(`${LEVEL}.publicLine`)}
          </Text>
        </SectionCard>
      )}
      {writeFailed && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID="write-failed">
              {t('socialRecovery.records.writeFailed')}
            </Alert.Text>
          }
        />
      )}
      <ActionsRow
        primary={
          <Button
            testID="continue"
            text={t('socialRecovery.actions.continue')}
            disabled={!ready || busy}
            onPress={onContinue}
            hasBottomSpacing={false}
          />
        }
        secondary={
          <Button
            testID="back"
            type="outline"
            text={t('socialRecovery.ceremony.backAction')}
            disabled={busy}
            onPress={() => navigate(WEB_ROUTES.socialRecoverySetupWaitingPeriod)}
            hasBottomSpacing={false}
          />
        }
      />
    </View>
  )
}

export default React.memo(PrivacyView)
