/**
 * The approval page's route, the one surface a guardian opens. It needs no
 * keystore and no listed account: it reads the request its link carries,
 * refuses one aimed at another deployment before any read, builds the
 * recovery client for the request's account, describes the request through
 * the client's approving side and reads the chain through the client. Until
 * the client stands, the request is described without one, so its values
 * show beside the reading with the sign held; a link this build cannot
 * describe shows a waiting block until the client answers. It
 * holds nothing of the recoverer's. Once described, the request's lead stays
 * on the page while the client is built again or a read runs or fails. The
 * signature is made in the wallet's own sign window through the request
 * queue, for the key the request names where this wallet holds it, once the
 * wallet has selected that key's account; a locked wallet goes to its unlock
 * first and comes back here with the request. Where the request names a
 * smart account the wallet lists and controls, the wallet signs as that
 * account once it is selected, the account's own check on chain accepts the
 * answer, and the chain's verdict judges the approval; an account the
 * request reads no code at cannot sign. A request ends for good once a
 * read found it dead or the recovery waiting, once its deadline passed, or
 * once the guardian declined it: a later failed or pending read does not open
 * it again. Its sign request is then withdrawn and an approval that arrives
 * for it is not shown. Once the approval exists, after a decline and after a
 * death the page reads the chain no more.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useLocation } from 'react-router-dom'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import flexbox from '@common/styles/utils/flexbox'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import useAccountsControllerState from '@web/hooks/useAccountsControllerState'
import useBackgroundService from '@web/hooks/useBackgroundService'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import { CHAIN_NAMES } from '@web/modules/social-recovery/recovery/entry'
import { TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import PlainChrome from '@web/modules/social-recovery/shared/chrome/PlainChrome'
import {
  addressBookOf,
  CHAIN_IDS,
  createSignerFacade,
  describeRequestOffline,
  descriptorOf,
  extensionProviderFor,
  isDeploymentRefusal,
  isValidAccountSignature,
  networkOf,
  signRequestPort,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import type { ApproverRequest } from '@kohaku-eth/social-recovery'
import type {
  AccountSignatureCheck,
  ListedAccount
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'

import ApproveView from './ApproveView'
import DeclinedBlock from './DeclinedBlock'
import { approvalEnded, domainAgrees, readingOf } from './reading'
import { approvalRequestOf, describedRequestOf } from './request'
import SignedBlock from './SignedBlock'
import { keyReadingOf, requestKeyOf, typedDataOf } from './signing'
import StatusBlock from './StatusBlock'
import type {
  ApprovalClient,
  DescribedRequest,
  GuardianSigningInput,
  ReplyChainVerdict
} from './types'
import useApprovalReads from './useApprovalReads'
import useDeadlineClock from './useDeadlineClock'
import useGuardianSigning from './useGuardianSigning'
import useKeyAccountSelection from './useKeyAccountSelection'
import { approvalValuesOf } from './values'

const closePage = () => window.close()

const ApproveScreen = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const { navigate } = useNavigation()
  const { networks } = useNetworksControllerState()
  const { accounts } = useAccountsControllerState()
  const { keys, isUnlocked, hasPasswordSecret } = useKeystoreControllerState()
  const { dispatch, windowId } = useBackgroundService()

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
  const clientError = clientState.status === 'failed' ? clientState.error : undefined
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
    // A deployment that refused its construction checks refuses again on every retry.
    if (isDeploymentRefusal(clientError)) {
      return { status: 'refused' }
    }
    return { status: 'failed', retry: clientState.retry }
  }, [kit, clientState.status, clientState.retry, clientError])

  // Undefined while no client stands; null where the client cannot describe the request.
  const fresh = useMemo(
    () => (kit ? describedRequestOf(request, (r) => kit.approving.describeRequest(r)) : undefined),
    [kit, request]
  )
  // The link's own description, drawn until the client stands.
  const offline = useMemo(
    () => (readable ? describedRequestOf(request, (r) => describeRequestOffline(r)) : null),
    [readable, request]
  )

  const accountsRef = useRef<readonly ListedAccount[] | undefined>(accounts)
  accountsRef.current = accounts
  const listedAccounts = useCallback(() => accountsRef.current, [])
  const networksRef = useRef(networks)
  networksRef.current = networks
  // A smart account's answer counts once the account itself accepts it on
  // chain, read over a provider of its own that the read releases.
  const accountSignatures = useCallback<AccountSignatureCheck>(
    async (account, digest, signature) => {
      const network = networkOf(networksRef.current, WALLET_RECOVERY_CHAIN)
      if (!network) {
        throw new Error(
          `The extension holds no network for chain ${CHAIN_IDS[WALLET_RECOVERY_CHAIN]}.`
        )
      }
      const provider = extensionProviderFor(network)
      try {
        return await isValidAccountSignature(provider, account, digest, signature)
      } finally {
        provider.destroy()
      }
    },
    []
  )
  const signer = useMemo(
    () =>
      createSignerFacade(signRequestPort(dispatch, listedAccounts, windowId), {
        chainId: CHAIN_IDS[WALLET_RECOVERY_CHAIN],
        accountSignatures
      }),
    [dispatch, listedAccounts, windowId, accountSignatures]
  )
  const selectKeyAccount = useKeyAccountSelection({ dispatch, accounts: listedAccounts })
  // The sign window signs for the selected account, so the key's account, or
  // the smart account itself, is selected first.
  const signTypedData = useCallback<GuardianSigningInput['signTypedData']>(
    async (key, data, options) => {
      await selectKeyAccount(key, options?.signal)
      return signer.signTypedData(key, data, options)
    },
    [selectKeyAccount, signer]
  )
  const typedData = useMemo(
    () => (kit && request ? typedDataOf((r) => kit.approving.signingInput(r), request) : null),
    [kit, request]
  )
  const requestKey = useMemo(
    () => (kit && request ? requestKeyOf(kit, request) : null),
    [kit, request]
  )
  const keyReading = keyReadingOf(
    requestKey,
    { keys, isUnlocked, hasPasswordSecret },
    accounts,
    request?.credentialHoldsCode ?? false
  )
  const chainVerdict = useMemo<ReplyChainVerdict | null>(
    () => (kit ? (r, reply) => kit.walletReads.verifyReply(r, reply) : null),
    [kit]
  )
  // The request that ended, read when an approval arrives: an ending holds
  // for its request whatever later reads say, and a new request starts with none.
  const shownRef = useRef(request)
  shownRef.current = request
  const endedFor = useRef<ApproverRequest | null>(null)
  const ended = useCallback(() => !!shownRef.current && endedFor.current === shownRef.current, [])
  const signing = useGuardianSigning({
    approving: kit?.approving ?? null,
    chainVerdict,
    request,
    signTypedData,
    ended
  })

  const [kept, setKept] = useState<DescribedRequest | null>(null)
  useEffect(() => {
    if (fresh !== undefined) {
      setKept(fresh)
    }
  }, [fresh])
  const keptForRequest = kept?.request === request ? kept : null
  const described = fresh !== undefined ? fresh : keptForRequest ?? (kit ? null : offline)
  // A death is final on chain: once a read found one, no round runs after it.
  const [diedFor, setDiedFor] = useState<ApproverRequest | null>(null)
  const { reads, refreshing, retry } = useApprovalReads({
    client: kit,
    link: location.search,
    enabled: readable && !declined && !signing.approval,
    stopped: !!request && diedFor === request
  })
  const clock = useDeadlineClock(request ? Number(request.validUntil) : null)
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, [])
  const reading = request
    ? readingOf(request, kit?.descriptor ?? build, client, reads, clock)
    : null
  if (request && (declined || (reading && approvalEnded(request, reading, clock)))) {
    endedFor.current = request
  }
  const requestEnded = !!request && endedFor.current === request
  const { withdraw } = signing
  useEffect(() => {
    if (requestEnded) {
      withdraw()
    }
  }, [requestEnded, request, withdraw])
  const dead = reading?.kind === 'dead'
  useEffect(() => {
    if (dead) {
      setDiedFor(request)
    }
  }, [dead, request])
  const networkName =
    networkOf(networks, WALLET_RECOVERY_CHAIN)?.name ?? CHAIN_NAMES[WALLET_RECOVERY_CHAIN]

  const onRetry = useCallback(() => {
    if (client.status === 'failed') {
      client.retry()
      return
    }
    retry()
  }, [client, retry])
  const onDecline = useCallback(() => {
    endedFor.current = request
    withdraw()
    setDeclinedFor(request)
  }, [request, withdraw])
  // A locked wallet goes to its unlock and comes back to this page with its
  // request; a held key signs in the wallet's sign window.
  const onSign = useCallback(() => {
    if (keyReading.kind === 'locked') {
      navigate(WEB_ROUTES.keyStoreUnlock, {
        state: {
          returnTo: { pathname: location.pathname, search: location.search, hash: location.hash }
        }
      })
      return
    }
    const signs =
      keyReading.kind === 'held' || (keyReading.kind === 'smartAccount' && keyReading.deployed)
    if (signs && typedData) {
      signing.sign(keyReading.key, typedData)
    }
  }, [keyReading, typedData, signing, navigate, location])

  const body = () => {
    if (!request || !reading || (kit && !described)) {
      return (
        <TwoColumn testID="guardian-no-request-columns">
          <Text fontSize={14} testID="guardian-no-request">
            {t('socialRecovery.guardianPage.noRequest')}
          </Text>
        </TwoColumn>
      )
    }
    if (signing.approval) {
      return <SignedBlock approval={signing.approval} account={request.account} />
    }
    if (declined) {
      const newKey = described
        ? approvalValuesOf(described.description, t).lines.find((line) => line.name === 'newKey')
            ?.value ?? null
        : null
      return <DeclinedBlock account={request.account} newKey={newKey} onClose={closePage} />
    }
    if (!described && reading.kind === 'reading') {
      return (
        <View testID="guardian-request-loading" style={flexbox.flex1}>
          <LoadingBlock variant="screen" message={t('socialRecovery.loading.request')} />
        </View>
      )
    }
    if (!described || reading.kind === 'other-deployment') {
      return (
        <TwoColumn testID="guardian-status-columns">
          <StatusBlock reading={reading} onRetry={onRetry} />
        </TwoColumn>
      )
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
        keyReading={keyReading}
        signing={signing}
        typedData={typedData}
        onSign={onSign}
        onClose={closePage}
        onDecline={onDecline}
        onRetry={onRetry}
        refreshing={refreshing || !kit}
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
