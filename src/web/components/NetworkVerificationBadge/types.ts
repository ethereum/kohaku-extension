import type { RpcProviderKind } from '@ambire-common/interfaces/network'

export type VerificationBadgeKind = RpcProviderKind | 'verified' | 'mixed' | 'hidden'

export type VerificationBadgeState = {
  kind: VerificationBadgeKind
  label: string
  tooltip: string
  targetUrl: string
}
