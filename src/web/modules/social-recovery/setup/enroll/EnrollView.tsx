/**
 * The enroll screen for one slot of the path: the passkey row or the guardian
 * row fills it with the credential its enrollment produced. Save and continue
 * and Back both return to the editor with the records as they stand.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  addressBookOf,
  recoveryChainOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import type { Enrollment } from '@web/modules/social-recovery/shared/records'

import ClientStateLine from './ClientStateLine'
import GuardianRow from './GuardianRow'
import PasskeyRow from './PasskeyRow'
import type { EnrollViewProps, LoadState } from './types'
import { readSlot } from './writes'

const EnrollView = ({
  records,
  chainId,
  account,
  navigate,
  search,
  client,
  deps
}: EnrollViewProps) => {
  const { t } = useTranslation()
  const setup = useMemo(() => records.setup(chainId, account), [records, chainId, account])
  const book = useMemo(
    () => addressBookOf(recoveryChainOf(chainId) ?? WALLET_RECOVERY_CHAIN),
    [chainId]
  )
  const served = !!search && (search.kind === 'passkey' || search.kind === 'ecdsa')
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!search || !served) {
      return undefined
    }
    let live = true
    setLoad({ status: 'loading' })
    readSlot(setup, search, book)
      .then((slot) => {
        if (live) {
          setLoad(slot)
        }
      })
      .catch(() => {
        if (live) {
          setLoad({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
    // The slot is read once per slot; a returned ceremony's id changes nothing here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, book, served, search?.kind, search?.at.clause, search?.at.member, attempt])

  const onEnrollment = useCallback(
    (enrollment: Enrollment) => setLoad({ status: 'enrolled', enrollment }),
    []
  )
  const toEditor = useCallback(() => navigate(WEB_ROUTES.socialRecoverySetupEditor), [navigate])

  const back = (
    <Button
      testID="enroll-back"
      type="outline"
      text={t('socialRecovery.ceremony.backAction')}
      onPress={toEditor}
      hasBottomSpacing={false}
    />
  )

  if (!search || !served || load.status === 'nothing') {
    return (
      <View testID="enroll-nothing">
        <Text fontSize={14} style={spacings.mbSm}>
          {t('socialRecovery.ceremony.nothingToRun')}
        </Text>
        {back}
      </View>
    )
  }

  if (load.status === 'loading') {
    return <ActivityIndicator testID="enroll-loading" />
  }

  if (load.status === 'failed') {
    return (
      <View testID="enroll-load-failed">
        <Text fontSize={14} appearance="errorText" style={spacings.mbSm}>
          {t('socialRecovery.records.loadFailed')}
        </Text>
        <View style={[flexbox.directionRow, flexbox.alignCenter]}>
          <Button
            testID="enroll-load-retry"
            type="outline"
            text={t('socialRecovery.writes.tryAgain')}
            onPress={() => setAttempt((n) => n + 1)}
            hasBottomSpacing={false}
            style={spacings.mrSm}
          />
          {back}
        </View>
      </View>
    )
  }

  const enrollment = load.status === 'enrolled' ? load.enrollment : null
  const row = {
    records,
    setup,
    chainId,
    account,
    navigate,
    search,
    book,
    client,
    deps,
    enrollment,
    onEnrollment
  }

  return (
    <View testID="enroll-screen">
      {search.kind === 'passkey' ? <PasskeyRow {...row} /> : <GuardianRow {...row} />}
      <ClientStateLine client={client} />
      {!enrollment && search.kind === 'passkey' && (
        <Text testID="enroll-create-first" fontSize={12} appearance="secondaryText">
          {t('socialRecovery.enroll.passkey.createFirst')}
        </Text>
      )}
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        {back}
        <Button
          testID="enroll-save"
          type="primary"
          text={
            enrollment?.test === 'failed'
              ? t('socialRecovery.actions.saveAnyway')
              : t('socialRecovery.actions.saveAndContinue')
          }
          disabled={!enrollment}
          onPress={toEditor}
          hasBottomSpacing={false}
        />
      </View>
      {!!enrollment && (
        <Text testID="enroll-save-without-test" fontSize={12} appearance="secondaryText">
          {t('socialRecovery.enroll.saveWithoutTest')}
        </Text>
      )}
    </View>
  )
}

export default React.memo(EnrollView)
