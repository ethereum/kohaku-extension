/**
 * The enroll screen for one slot of the path: the passkey row or the guardian
 * row fills it with the credential its enrollment produced. Save and continue
 * and Back both return to the editor with the records as they stand.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import {
  addressBookOf,
  recoveryChainOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'
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
        <Alert
          type="error"
          size="sm"
          text={
            <Alert.Text size="sm" type="error">
              {t('socialRecovery.records.loadFailed')}
            </Alert.Text>
          }
        />
        <ActionsRow
          primary={
            <Button
              testID="enroll-load-retry"
              type="primary"
              text={t('socialRecovery.writes.tryAgain')}
              onPress={() => setAttempt((n) => n + 1)}
              hasBottomSpacing={false}
            />
          }
          secondary={back}
        />
      </View>
    )
  }

  const enrollment = load.status === 'enrolled' ? load.enrollment : null
  let note: string | undefined
  let noteTestID: string | undefined
  if (enrollment) {
    note = t('socialRecovery.enroll.saveWithoutTest')
    noteTestID = 'enroll-save-without-test'
  } else if (search.kind === 'passkey') {
    note = t('socialRecovery.enroll.passkey.createFirst')
    noteTestID = 'enroll-create-first'
  }
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
      <ActionsRow
        primary={
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
        }
        secondary={back}
        note={note}
        noteTestID={noteTestID}
      />
    </View>
  )
}

export default React.memo(EnrollView)
