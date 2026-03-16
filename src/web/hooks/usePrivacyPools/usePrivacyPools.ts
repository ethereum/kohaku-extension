import { useContext, useMemo } from 'react'

import type { PPv1Address, PPv1AssetAmount, PPv1AssetBalance } from '@kohaku-eth/privacy-pools'

import { PrivacyPoolsV1ControllerStateContext } from '@web/contexts/privacyPoolsV1ControllerStateContext/privacyPoolsV1ControllerStateContext'
import {
  INote,
  OpStatus,
  PendingUnshieldOperation,
  State
} from '@ambire-common/controllers/privacyPools/privacyPoolsV1'
import { SignAccountOpController } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { AccountOp } from '@ambire-common/libs/accountOp/accountOp'
import { formatUnits, toHex } from 'viem'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState/useSelectedAccountControllerState'

type SyncState = 'unsynced' | 'syncing' | 'synced'

type UsePrivacyPoolsReturn = {
  balance: PPv1AssetBalance[]
  shield: (asset: PPv1AssetAmount) => void
  prepareUnshield: (asset: PPv1AssetAmount, to: PPv1Address) => void
  unshield: () => void
  pendingUnshieldOperation: PendingUnshieldOperation | null
  sync: () => void
  isReady: boolean
  syncState: SyncState
  isSynced: boolean
  initializationError: string | null
  state: State
  lastOp: OpStatus | null
  signAccountOpController: SignAccountOpController | null
  latestBroadcastedAccountOp: AccountOp | null
  isShielding: boolean
  isPreparingUnshield: boolean
  hasProceeded: boolean
  isUnshielding: boolean
  isIdling: boolean
  shieldError: string
  unshieldError: string
  notes: INote[]
  approvedBalance: PPv1AssetBalance[]
  pendingBalance: PPv1AssetBalance[]
  approvedNotes: INote[]
  pendingNotes: INote[]
  totalPrivatePortfolio: number
  getAssetBalances: (assetAddress: string) => {
    approved: bigint
    pending: bigint
    approvedNotes: INote[]
    pendingNotes: INote[]
  }
}

const usePrivacyPools = (): UsePrivacyPoolsReturn => {
  const {
    balance,
    sync,
    syncState,
    isInitialized,
    initializationError,
    shield,
    prepareUnshield,
    unshield,
    pendingUnshieldOperation,
    state,
    lastOp,
    notes,
    hasProceeded,
    signAccountOpController,
    latestBroadcastedAccountOp
  } = useContext(PrivacyPoolsV1ControllerStateContext)
  const { portfolio } = useSelectedAccountControllerState()
  const isSynced = useMemo(() => syncState === 'synced', [syncState])
  const isShielding = useMemo(() => state === 'shielding', [state])
  const isPreparingUnshield = useMemo(() => state === 'preparing-unshield', [state])
  const isUnshielding = useMemo(() => state === 'unshielding', [state])
  const isIdling = useMemo(() => state === 'idle', [state])
  const shieldError = useMemo(
    () => (lastOp && lastOp.op === 'shielding' && lastOp.error) || '',
    [lastOp]
  )

  const unshieldError = useMemo(
    () => (lastOp && lastOp.op === 'unshielding' && lastOp.error) || '',
    [lastOp]
  )

  const approvedBalance = useMemo(() => balance.filter((b) => b.tag === undefined), [balance])
  const pendingBalance = useMemo(() => balance.filter((b) => b.tag === 'pending'), [balance])
  const approvedNotes = useMemo(() => notes.filter((n) => n.approved), [notes])
  const pendingNotes = useMemo(() => notes.filter((n) => !n.approved), [notes])

  const getAssetBalances = (assetAddress: string) =>
    useMemo(
      () => ({
        approved: approvedBalance
          .filter((b) => b.asset.contract === assetAddress)
          .reduce((totalBalance, currBalance) => totalBalance + currBalance.amount, 0n),
        pending: pendingBalance
          .filter((b) => b.asset.contract === assetAddress)
          .reduce((totalBalance, currBalance) => totalBalance + currBalance.amount, 0n),
        approvedNotes: approvedNotes.filter(
          (n) => toHex(n.assetAddress).toLowerCase() === assetAddress.toLowerCase()
        ),
        pendingNotes: pendingNotes.filter(
          (n) => toHex(n.assetAddress).toLowerCase() === assetAddress.toLowerCase()
        )
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [approvedBalance, pendingBalance, approvedNotes, pendingNotes, assetAddress]
    )

  const totalPrivatePortfolio = useMemo(() => {
    if (!portfolio?.tokens) return 0

    // Group approved notes by asset address and sum their balances
    const balancesByAsset = approvedNotes.reduce<Record<string, bigint>>((acc, note) => {
      const address = toHex(note.assetAddress, { size: 20 }).toLowerCase()
      return { ...acc, [address]: (acc[address] ?? 0n) + note.balance }
    }, {})

    // Calculate USD value for each asset
    return Object.entries(balancesByAsset).reduce((totalUSD, [address, amount]) => {
      // Find the matching token in portfolio
      const portfolioToken = portfolio.tokens.find(
        (token) => token.address.toLowerCase() === address
      )

      if (!portfolioToken) return totalUSD

      // Convert amount from bigint to number using token decimals
      const tokenAmount = Number(formatUnits(amount, portfolioToken.decimals))

      // Get USD price
      const usdPrice = portfolioToken.priceIn.find((p) => p.baseCurrency === 'usd')?.price ?? 0

      // Add to total
      return totalUSD + tokenAmount * usdPrice
    }, 0)
  }, [approvedNotes, portfolio?.tokens])

  return {
    hasProceeded,
    signAccountOpController,
    latestBroadcastedAccountOp,
    balance,
    shield,
    prepareUnshield,
    unshield,
    pendingUnshieldOperation,
    sync,
    isSynced,
    syncState,
    isReady: isInitialized,
    initializationError,
    state,
    lastOp,
    isIdling,
    isShielding,
    isPreparingUnshield,
    isUnshielding,
    shieldError,
    unshieldError,
    approvedBalance,
    pendingBalance,
    notes,
    approvedNotes,
    pendingNotes,
    totalPrivatePortfolio,
    getAssetBalances
  }
}

export default usePrivacyPools
