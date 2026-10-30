/**
 * The recovery in progress's route: the list of the recovery chain's live
 * sessions, at the collection's stage, under the plain header where every one
 * came by the fast track and the settings chrome otherwise, with this device's
 * hold on each account's unlocked path, the decrypted setup cache or the
 * recovery password held in memory. Until the first read of the list answers,
 * the settings chrome holds a waiting block; the view then mounts once, under
 * the chrome it keeps.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'

import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import flexbox from '@common/styles/utils/flexbox'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import RecoveryChrome from '@web/modules/social-recovery/shared/chrome/RecoveryChrome'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import type { Address } from '@kohaku-eth/social-recovery'
import {
  createWalletRecords,
  extensionRecordStorage,
  readRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import type { RecoveryRoute } from '@web/modules/social-recovery/shared/records'

import { CHECKLIST_STAGE } from './constants'
import { inProgressItemsOf, routeOfItems } from './inProgress'
import InProgressView from './InProgressView'
import useSessionHeadline from './useSessionHeadline'

const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const InProgressScreen = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const [route, setRoute] = useState<RecoveryRoute | undefined>()
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])

  // A failed read takes the settings chrome; the view reads again and shows
  // the failure with its retry.
  useEffect(() => {
    let live = true
    Promise.all([records.listRecoverySessions(CHAIN_ID), records.listRecoveryEntries(CHAIN_ID)])
      .then(([sessions, entries]) => routeOfItems(inProgressItemsOf(sessions, entries)))
      .catch((): RecoveryRoute => 'logged-in')
      .then((read) => {
        if (live) {
          setRoute((held) => held ?? read)
        }
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [records])

  const holdsPath = useCallback(
    async (account: Address) => {
      if (readRecoveryPassword(CHAIN_ID, account) !== undefined) {
        return true
      }
      const cached = await records.decryptedSetupCache(CHAIN_ID, account).read()
      return cached.status === 'present'
    },
    [records]
  )

  if (!route) {
    return (
      <RecoveryChrome
        route={null}
        titleKey="socialRecovery.routes.recovery"
        stage={{ step: CHECKLIST_STAGE, testID: 'recovery-stage' }}
        testID="in-progress-screen"
      >
        <View testID="in-progress-route-loading" style={flexbox.flex1}>
          <LoadingBlock variant="screen" message={t('socialRecovery.loading.entries')} />
        </View>
      </RecoveryChrome>
    )
  }

  const view = (
    <InProgressView
      records={records}
      chainId={CHAIN_ID}
      navigate={navigate}
      timeZone={timeZone}
      holdsPath={holdsPath}
      useHeadline={useSessionHeadline}
      onRoute={setRoute}
    />
  )
  return (
    <RecoveryChrome
      route={route}
      titleKey="socialRecovery.routes.recovery"
      stage={{ step: CHECKLIST_STAGE, testID: 'recovery-stage' }}
      testID="in-progress-screen"
    >
      {view}
    </RecoveryChrome>
  )
}

export default React.memo(InProgressScreen)
