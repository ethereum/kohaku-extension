/**
 * The Recovery Card in the settings chrome, for the selected account on the
 * recovery chain. The level comes from the route's search the save passes,
 * else from the stored draft; with neither, the card takes the hidden level,
 * which carries the password row and so never drops the password silently.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useLocation } from 'react-router-dom'
import { isAddress } from 'viem'

import AmbireLogoHorizontal from '@common/components/AmbireLogoHorizontal'
import Panel from '@common/components/Panel'
import { getPanelPaddings } from '@common/components/Panel/Panel'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import Sidebar from '@web/modules/settings/components/Sidebar'
import getStyles from '@web/modules/settings/contexts/SettingsRoutesContext/styles'
import { CHAIN_IDS, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage,
  readRecoveryPassword
} from '@web/modules/social-recovery/shared/records'

import { levelFromSearch, levelOfBackup } from './card'
import { markCardCarried, wasCardCarried } from './carried'
import { BROWSER_CARRIERS } from './carriers'
import ExtensionPasswordAsk from './ExtensionPasswordAsk'
import RecoveryCardView from './RecoveryCardView'
import type { DraftLevel, PasswordAskAnswer } from './types'

const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

const renderPasswordAsk = (answer: PasswordAskAnswer) => <ExtensionPasswordAsk {...answer} />

const RecoveryCardScreen = () => {
  const { t } = useTranslation()
  const { styles } = useTheme(getStyles)
  const { maxWidthSize } = useWindowSize()
  const { navigate, goBack } = useNavigation()
  const location = useLocation()
  const { account } = useSelectedAccountControllerState()

  const isScreenXxl = maxWidthSize('xxl')
  const isScreenXl = maxWidthSize('xl')
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])

  // The selected account arrives from the background's state push.
  const address = account && isAddress(account.addr) ? account.addr : null
  const searchLevel = useMemo(() => levelFromSearch(location.search), [location.search])
  // The draft's level belongs to the account it was read for, so another
  // account never shows it while its own draft loads.
  const [draftLevel, setDraftLevel] = useState<DraftLevel | null>(null)

  useEffect(() => {
    if (!address || searchLevel) {
      return
    }
    let live = true
    records
      .setup(chainId, address)
      .setupDraft.read()
      .then((draft) => {
        if (!live) {
          return
        }
        setDraftLevel({
          address,
          level: draft.status === 'present' ? levelOfBackup(draft.value.privacy.backup) : 'hidden'
        })
      })
      .catch(() => {
        if (live) {
          setDraftLevel({ address, level: 'hidden' })
        }
      })
    return () => {
      live = false
    }
  }, [records, address, searchLevel])

  const level =
    searchLevel ?? (draftLevel && draftLevel.address === address ? draftLevel.level : null)
  const password = useMemo(
    () => (address ? readRecoveryPassword(chainId, address) : undefined),
    [address]
  )
  const carriedBefore = useMemo(
    () => (address ? wasCardCarried(chainId, address) : false),
    [address]
  )

  const onCarried = useCallback(() => {
    if (address) {
      markCardCarried(chainId, address)
    }
  }, [address])
  const toManage = useCallback(() => navigate(WEB_ROUTES.socialRecoveryManage), [navigate])
  const toPrivacy = useCallback(() => navigate(WEB_ROUTES.socialRecoverySetupPrivacy), [navigate])

  return (
    <View style={styles.background}>
      <View style={[styles.container, !isScreenXl ? common.fullWidth : {}]}>
        <Sidebar activeLink="account-recovery" />
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <AmbireLogoHorizontal />
          </View>
          <Panel
            style={[
              styles.panel,
              !isScreenXl ? common.fullWidth : {},
              { ...spacings.ph0, ...spacings.pv0 }
            ]}
          >
            <ScrollView contentContainerStyle={getPanelPaddings(maxWidthSize, 'large')}>
              <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
                {t('socialRecovery.chrome.breadcrumb')}
              </Text>
              {!!address && !!level && (
                <RecoveryCardView
                  key={address}
                  account={address}
                  level={level}
                  password={password}
                  carriedBefore={carriedBefore}
                  onCarried={onCarried}
                  carriers={BROWSER_CARRIERS}
                  renderPasswordAsk={renderPasswordAsk}
                  onSetPasswordAgain={toPrivacy}
                  onBack={goBack}
                  onContinue={toManage}
                />
              )}
            </ScrollView>
          </Panel>
        </View>
        {isScreenXxl ? (
          <View style={styles.sideContainer}>
            <Sidebar activeLink="account-recovery" />
          </View>
        ) : null}
      </View>
    </View>
  )
}

export default React.memo(RecoveryCardScreen)
