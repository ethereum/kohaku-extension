/**
 * The approval page's route, the one surface a guardian opens. It needs no
 * keystore and no listed account: it reads the request its link carries,
 * refuses one aimed at another deployment before any read, builds the
 * recovery client for the request's account, describes the request through
 * the client's approving side and reads the chain through the client. It
 * holds nothing of the recoverer's. Once described, the request's lead stays
 * on the page while the client is built again or a read runs or fails.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import { CHAIN_NAMES } from '@web/modules/social-recovery/recovery/entry'
import PlainChrome from '@web/modules/social-recovery/shared/chrome/PlainChrome'
import {
  addressBookOf,
  descriptorOf,
  networkOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import type { ApproverRequest } from '@web/modules/social-recovery/sdk-interfaces'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'

import ApproveView from './ApproveView'
import DeclinedBlock from './DeclinedBlock'
import { domainAgrees, readingOf } from './reading'
import { approvalRequestOf, describedRequestOf } from './request'
import StatusBlock from './StatusBlock'
import type { ApprovalClient, DescribedRequest } from './types'
import useApprovalReads from './useApprovalReads'
import useDeadlineClock from './useDeadlineClock'

const closePage = () => window.close()

const ApproveScreen = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const { networks } = useNetworksControllerState()

  const request = useMemo(
    () => approvalRequestOf(location.search, window.location.hash),
    [location.search]
  )
  // Decline belongs to the request it was pressed for: another link opened in
  // the same tab is not declined.
  const [declinedFor, setDeclinedFor] = useState<ApproverRequest | null>(null)
  const declined = !!request && declinedFor === request
  const build = useMemo(
    () => descriptorOf(WALLET_RECOVERY_CHAIN, addressBookOf(WALLET_RECOVERY_CHAIN)),
    []
  )
  // A request aimed at another deployment builds no client and reads nothing.
  const readable = !!request && domainAgrees(request, build)

  const clientState = useRecoveryClient(readable ? request?.account : undefined)
  const kit = clientState.status === 'ready' ? clientState.client : null
  const client = useMemo<ApprovalClient>(() => {
    if (kit) {
      return { status: 'ready', client: kit }
    }
    if (clientState.status === 'loading') {
      return { status: 'loading' }
    }
    if (clientState.status === 'update-the-wallet') {
      return { status: 'refused' }
    }
    return { status: 'failed', retry: clientState.retry }
  }, [kit, clientState.status, clientState.retry])

  // Undefined while no client stands; null where the client cannot describe the request.
  const fresh = useMemo(
    () => (kit ? describedRequestOf(request, (r) => kit.approving.describeRequest(r)) : undefined),
    [kit, request]
  )
  const [kept, setKept] = useState<DescribedRequest | null>(null)
  useEffect(() => {
    if (fresh !== undefined) {
      setKept(fresh)
    }
  }, [fresh])
  const described = fresh !== undefined ? fresh : kept?.request === request ? kept : null
  const { reads, retry } = useApprovalReads({
    client: kit,
    link: location.search,
    enabled: readable && !declined
  })
  const clock = useDeadlineClock(request ? Number(request.validUntil) : null)
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const networkName =
    networkOf(networks, WALLET_RECOVERY_CHAIN)?.name ?? CHAIN_NAMES[WALLET_RECOVERY_CHAIN]

  const onRetry = useCallback(() => {
    if (client.status === 'failed') {
      client.retry()
      return
    }
    retry()
  }, [client, retry])
  const onDecline = useCallback(() => setDeclinedFor(request), [request])

  const body = () => {
    if (!request || (kit && !described)) {
      return (
        <Text fontSize={14} testID="guardian-no-request">
          {t('socialRecovery.guardianPage.noRequest')}
        </Text>
      )
    }
    if (declined) {
      return <DeclinedBlock onClose={closePage} />
    }
    const reading = readingOf(request, kit?.descriptor ?? build, client, reads, clock)
    if (!described || reading.kind === 'other-deployment') {
      return <StatusBlock reading={reading} onRetry={onRetry} />
    }
    // The tick belongs to one request: another link opened in the same tab starts unticked.
    return (
      <ApproveView
        key={location.search}
        described={described}
        reading={reading}
        networkName={networkName}
        now={clock}
        timeZone={timeZone}
        onClose={closePage}
        onDecline={onDecline}
        onRetry={onRetry}
      />
    )
  }

  return (
    <PlainChrome title={t('socialRecovery.routes.approve')} testID="guardian-approve">
      {body()}
    </PlainChrome>
  )
}

export default React.memo(ApproveScreen)
