import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'

import type { VerificationBadgeKind, VerificationBadgeState } from './types'

export default function useRpcVerificationBadgeState(): VerificationBadgeState {
  const { t } = useTranslation()
  const { networks } = useNetworksControllerState()

  return useMemo(() => {
    const hidden: VerificationBadgeState = {
      kind: 'hidden',
      label: '',
      tooltip: '',
      targetUrl: WEB_ROUTES.networksSettings
    }

    const networksToConsider = networks

    if (networksToConsider.length === 0) return hidden

    const kinds = networksToConsider.map((n) => n.rpcProvider ?? 'rpc')
    const hasUnverified = kinds.includes('rpc')
    const hasVerified = kinds.some((kind) => kind === 'helios' || kind === 'colibri')
    const verifiedKinds = [...new Set(kinds.filter((kind) => kind !== 'rpc'))]
    let kind: VerificationBadgeKind
    let label: string
    let tooltip: string
    const targetUrl =
      networksToConsider.length === 1
        ? `${WEB_ROUTES.networksSettings}?chainId=${networksToConsider[0].chainId}&openEditForm=true`
        : WEB_ROUTES.networksSettings

    if (hasVerified && hasUnverified) {
      kind = 'mixed'
      label = t('Mixed verification')
      tooltip = t(
        'Some active networks use verified RPC providers, while others use unverified RPC providers.'
      )
    } else if (hasVerified) {
      if (verifiedKinds.length === 1 && verifiedKinds[0] === 'helios') {
        kind = 'helios'
        label = t('Verified by Helios')
        tooltip = t(
          'RPC requests are routed through Helios light client. Safety note: Some requests may still fall back to an unverified RPC provider.'
        )
      } else if (verifiedKinds.length === 1 && verifiedKinds[0] === 'colibri') {
        kind = 'colibri'
        label = t('Verified by Colibri')
        tooltip = t(
          'RPC requests are routed through Colibri stateless client. Safety note: Some requests may still fall back to an unverified RPC provider.'
        )
      } else {
        kind = 'verified'
        label = t('Verified RPC')
        tooltip = t(
          'All active networks use verified RPC providers (Helios or Colibri). Safety note: Some requests may still fall back to an unverified RPC provider.'
        )
      }
    } else {
      kind = 'rpc'
      label = t('Unverified RPC')
      tooltip = t('All active networks use unverified RPC providers.')
    }

    return {
      kind,
      label,
      tooltip,
      targetUrl
    }
  }, [networks, t])
}
