import React, { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, View } from 'react-native'
import { ScrollView } from 'react-native-gesture-handler'

import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import { ScreenMode } from './interface'

interface Props {
  origin?: string
  screenMode: ScreenMode
  setScreenMode: React.Dispatch<React.SetStateAction<ScreenMode>>
  setSelectedAccount: React.Dispatch<
    React.SetStateAction<{
      isNew: boolean
      address: string
    } | null>
  >
}

const SeedPhraseGroup: FC<{
  label: string
  seedId: string
  onAddAccount: (seedId: string) => void
}> = ({ label, seedId, onAddAccount }) => {
  const { theme } = useTheme()
  const [hovered, setHovered] = React.useState(false)

  return (
    <View style={spacings.mbTy}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
        <Text weight="medium" appearance="secondaryText" numberOfLines={1} style={flexbox.flex1}>
          {label}
        </Text>
        <Pressable
          onPress={() => onAddAccount(seedId)}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={[
            spacings.mhTy,
            common.borderRadiusPrimary,
            spacings.pvTy,
            spacings.phTy,
            hovered && { backgroundColor: theme.secondaryBackground }
          ]}
        >
          <Text
            fontSize={24}
            weight="medium"
            appearance="secondaryText"
            style={{ color: theme.primary, lineHeight: 24, includeFontPadding: false }}
          >
            +
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const DappCreateNewAccount: FC<Props> = ({
  screenMode,
  setSelectedAccount,
  setScreenMode,
  origin
}) => {
  const { t } = useTranslation()
  const { accounts } = useAccountsControllerState()
  const { subType, initParams } = useAccountPickerControllerState()
  const { dispatch } = useBackgroundService()
  const { keys, seeds } = useKeystoreControllerState()

  const [seedId, setSeedId] = React.useState<string | null>(null)
  const [accountPickerInitialized, setAccountPickerInitialized] = useState(false)

  const dappId = useMemo(() => getDappIdFromUrl(origin || ''), [origin])
  const newlyAddedAccounts = useMemo(() => accounts.filter((acc) => acc.newlyAdded), [accounts])

  // ? useEffects are used to step through the account creation process
  // ? instead of a single function because the `dispatch` calls are async
  // ? and we need to wait for state updates.

  // Create the new account with the selected seed phrase
  useEffect(() => {
    if (!seedId) return
    dispatch({
      type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_FROM_SAVED_SEED_PHRASE',
      params: { id: seedId }
    })

    setSeedId(null)
  }, [seedId, dispatch])

  // Trigger initialization of the new account
  useEffect(() => {
    if (accountPickerInitialized) return
    if (!initParams) return // Initialized by `MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_FROM_SAVED_SEED_PHRASE`
    if (subType !== 'seed') return

    setAccountPickerInitialized(true)
    dispatch({
      type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT'
    })
  }, [initParams, subType, dispatch])

  // Update the newly created account with dapp association and label
  useEffect(() => {
    if (!newlyAddedAccounts.length) return // Added by `MAIN_CONTROLLER_ACCOUNT_PICKER_INIT`

    // eslint-disable-next-line array-callback-return
    newlyAddedAccounts.map((acc) => {
      dispatch({
        type: 'ACCOUNTS_CONTROLLER_SET_ASSOCIATED_DAPPS',
        params: {
          addr: acc.addr,
          dappUrls: [dappId]
        }
      })

      const label = `${new URL(origin || '').hostname} Dapp Account`
      dispatch({
        type: 'ACCOUNTS_CONTROLLER_UPDATE_ACCOUNT_PREFERENCES',
        params: [
          {
            addr: acc.addr,
            preferences: {
              label,
              pfp: acc.preferences.pfp
            }
          }
        ]
      })

      setSelectedAccount({ isNew: true, address: acc.addr })
    })

    // Reset state
    dispatch({ type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE' })
    dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET' })

    setScreenMode('all')
  }, [newlyAddedAccounts, dispatch])

  const toggleFullscreen = () =>
    setScreenMode((prev) => (prev === 'new-account' ? 'all' : 'new-account'))

  const onAddAccount = useCallback((_seedId: string) => {
    setSeedId(_seedId)
  }, [])

  // Collect unique seed phrases (even if they have no accounts yet)
  const seedPhraseGroups = useMemo(() => {
    const groups: { label: string; seedId: string }[] = []
    const seen = new Set<string>()

    // From existing accounts
    accounts.forEach((acc) => {
      const key = keys.find((k) => acc.associatedKeys.includes(k.addr))
      if (!key || key.type !== 'internal') return
      const seed = seeds.find((s) => s.id === key.meta.fromSeedId)
      if (!seed || seen.has(seed.id)) return
      seen.add(seed.id)
      groups.push({ label: seed.label, seedId: seed.id })
    })

    // Add seeds that have no accounts yet
    seeds.forEach((seed) => {
      if (!seen.has(seed.id)) {
        groups.push({ label: seed.label, seedId: seed.id })
      }
    })

    return groups
  }, [accounts, keys, seeds])

  return (
    <View style={{ width: '100%' }}>
      {screenMode === 'new-account' && (
        <ScrollView style={{ flex: 1 }}>
          <View style={spacings.mt}>
            <View
              style={[
                flexbox.directionRow,
                flexbox.alignCenter,
                flexbox.justifySpaceBetween,
                spacings.mbSm
              ]}
            >
              <Text fontSize={16} weight="semiBold" appearance="primaryText">
                {t('Select a seed phrase')}
              </Text>
              <Button text={t('Back')} size="small" onPress={() => setScreenMode('all')} />
            </View>

            {seedPhraseGroups.length > 0 ? (
              seedPhraseGroups.map((group) => (
                <SeedPhraseGroup
                  key={group.seedId}
                  label={group.label}
                  seedId={group.seedId}
                  onAddAccount={onAddAccount}
                />
              ))
            ) : (
              <Text
                appearance="secondaryText"
                style={{ textAlign: 'center', opacity: 0.7, ...spacings.ph }}
              >
                {t('No seed phrases available. Create one first.')}
              </Text>
            )}
          </View>
        </ScrollView>
      )}

      <Button
        type={screenMode === 'new-account' ? 'secondary' : 'success'}
        size="small"
        text={screenMode === 'new-account' ? t('Back') : t('Generate Fresh Account')}
        hasBottomSpacing={false}
        style={[spacings.mhMi, spacings.mtTy]}
        onPress={toggleFullscreen}
      />
    </View>
  )
}

export default React.memo(DappCreateNewAccount)
