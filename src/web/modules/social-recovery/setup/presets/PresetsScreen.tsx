/**
 * The presets in the settings chrome, for the setup tab's account on the
 * recovery chain. A basic account, which this release cannot recover, sees
 * that refusal in their place, before any client is built or any record of a
 * draft is read. Any other account sees the presets only once the setup state
 * answers that no setup is committed; while it reads, where it failed, and
 * where a setup exists, step 1 shows that state in their place.
 */
import React, { useCallback, useMemo } from 'react'
import { View } from 'react-native'
import { isAddress, isAddressEqual } from 'viem'

import { isSmartAccount } from '@ambire-common/libs/account/account'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import { PageTitle, TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import {
  SETUP_STAGE_COUNTER_KEY,
  SETUP_STAGES
} from '@web/modules/social-recovery/shared/chrome/constants'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'
import CannotRecoverCard from '@web/modules/social-recovery/setup/review/CannotRecoverCard'

import PresetsView from './PresetsView'
import RecoverLink from './RecoverLink'
import SetupEntryBlock from './SetupEntryBlock'
import { useSetupEntry } from './useSetupEntry'

const PresetsScreen = () => {
  const { t } = useTranslation()
  const { navigate } = useNavigation()
  const { account: address } = useSetupAccount()
  const { accounts } = useAccountsControllerState()

  // The wallet's own record of the tab's account, from the background's state push.
  const listed = address
    ? accounts?.find(
        (candidate) => isAddress(candidate.addr) && isAddressEqual(candidate.addr, address)
      )
    : undefined
  const basicAccount = !!listed && !isSmartAccount(listed)
  const entry = useSetupEntry(useRecoveryClient(basicAccount ? undefined : address))
  const opensPresets =
    entry.status === 'answered' && (entry.kind === 'not-set-up' || entry.kind === 'mirror')
  const refused = basicAccount || (entry.status === 'answered' && !opensPresets)

  const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const openEditor = useCallback(() => navigate(WEB_ROUTES.socialRecoverySetupEditor), [navigate])
  const recover = useCallback(() => navigate(WEB_ROUTES.socialRecoveryRecovery), [navigate])
  const openPath = useCallback(() => navigate(WEB_ROUTES.socialRecoveryManage), [navigate])

  return (
    <SetupChrome
      // A refusal is no step of the setup, so it shows no stage counter.
      counter={
        refused
          ? undefined
          : {
              labelKey: SETUP_STAGE_COUNTER_KEY,
              step: 1,
              total: SETUP_STAGES,
              testID: 'presets-stage'
            }
      }
    >
      {!!address && basicAccount && (
        <TwoColumn testID="presets-screen-columns">
          <View testID="presets-cannot-recover">
            <PageTitle title={t('socialRecovery.routes.root')} />
            <CannotRecoverCard blocked={{ kind: 'cannot-recover', reason: 'not-supported' }} />
            <RecoverLink onRecover={recover} />
          </View>
        </TwoColumn>
      )}
      {!!address && !basicAccount && !opensPresets && (
        <TwoColumn testID="presets-screen-columns">
          <SetupEntryBlock entry={entry} onOpen={openPath} onRecover={recover} />
        </TwoColumn>
      )}
      {/* Another account or chain mounts a new view, so no state carries across. */}
      {!!address && !basicAccount && opensPresets && (
        <PresetsView
          key={`${chainId}:${address}`}
          records={records}
          chainId={chainId}
          account={address}
          onOpenEditor={openEditor}
          onRecover={recover}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(PresetsScreen)
