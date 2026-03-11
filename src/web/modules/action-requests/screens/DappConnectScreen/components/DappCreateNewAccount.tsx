import React, { FC, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'

import { getDappIdFromUrl } from '@ambire-common/libs/dapps/helpers'
import Button from '@common/components/Button'
import spacings from '@common/styles/spacings'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useAccountPickerControllerState from '@web/hooks/useAccountPickerControllerState'
import Spinner from '@common/components/Spinner'
import { DappAccount } from './interface'

interface Props {
  origin?: string
  autoConnect: (account: DappAccount) => void
}

const DappCreateNewAccount: FC<Props> = ({ origin, autoConnect }) => {
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

      const label = `${new URL(origin || '').hostname} Account`
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

      autoConnect({ isNew: true, address: acc.addr })
    })

    // Reset state
    dispatch({ type: 'ACCOUNTS_CONTROLLER_RESET_ACCOUNTS_NEWLY_ADDED_STATE' })
    dispatch({ type: 'MAIN_CONTROLLER_ACCOUNT_PICKER_RESET' })

    // setScreenMode('all')
    setSeedId(null)
  }, [newlyAddedAccounts, dispatch])

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

  const handleGenerateFreshAccount = useCallback(() => {
    if (!seedPhraseGroups.length || seedId) return
    onAddAccount(seedPhraseGroups[0].seedId)
  }, [seedPhraseGroups, seedId, onAddAccount])

  return (
    <View style={{ width: '100%' }}>
      <Button
        type="success"
        size="small"
        text={seedId ? undefined : t('Generate Fresh Account')}
        hasBottomSpacing={false}
        style={[spacings.mhMi, spacings.mtTy, seedId ? { backgroundColor: 'transparent' } : {}]}
        onPress={handleGenerateFreshAccount}
        disabled={!!seedId || !seedPhraseGroups.length}
      >
        {!!seedId && (
          <Spinner variant="gradient" style={{ width: 16, height: 16, marginRight: 6 }} />
        )}
      </Button>
    </View>
  )
}

export default React.memo(DappCreateNewAccount)
