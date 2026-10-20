/**
 * The edit of the committed recovery path: the overview's reads in front,
 * the committed configuration loaded into the setup records, then the setup's
 * own editor over them under this page's one title, with every member the
 * rule cannot lose marked still needed and held from removal, and the
 * committed values above its review action, the waiting period, the recovery
 * password and the privacy level, each opening its own step. What the edit
 * changes and the stale card line follow every write of the draft.
 *
 * A write stored on this device as in flight sends the holder to the screen
 * that follows it, so no edit starts over a write on its way. Cancel drops
 * the edit: the setup records, the session and a new password.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import { useTranslation } from '@common/config/localization'
import useNavigation from '@common/hooks/useNavigation'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { useOverviewReads } from '@web/modules/social-recovery/management/overview/useOverviewReads'
import type { SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'
import { PageTitle } from '@web/modules/social-recovery/shared/chrome'
import SetupChrome from '@web/modules/social-recovery/shared/chrome/SetupChrome'
import useSetupAccount from '@web/modules/social-recovery/shared/chrome/useSetupAccount'
import {
  addressBookOf,
  CHAIN_IDS,
  privacyLevelOf,
  WALLET_RECOVERY_CHAIN
} from '@web/modules/social-recovery/shared/client'
import { useRecoveryClient } from '@web/modules/social-recovery/shared/client/useRecoveryClient'
import {
  createWalletRecords,
  extensionRecordStorage,
  readRecoveryPassword,
  setRecoveryPassword,
  wipeRecoveryPassword
} from '@web/modules/social-recovery/shared/records'
import type { WalletRecords } from '@web/modules/social-recovery/shared/records'
import { intentOfRequest } from '@web/modules/social-recovery/shared/writes'
import type { EditorClient } from '@web/modules/social-recovery/setup/editor/types'
import PrivacyView from '@web/modules/social-recovery/setup/privacy/PrivacyView'
import WaitingPeriodView from '@web/modules/social-recovery/setup/privacy/WaitingPeriodView'

import { changesOf, passwordChangedOf, stillNeededOf } from './changes'
import { EDITOR } from './constants'
import { ruleOfPath } from './copy'
import EditOpenFailed from './EditOpenFailed'
import EditPath from './EditPath'
import { openEditSession } from './load'
import PasswordChange from './PasswordChange'
import ReadsGate from './ReadsGate'
import { editorTargetOf, isPrivacyContinue } from './routing'
import { dropNewPassword, editSessionOf, holdNewPassword } from './session'
import type { EditSession, EditStage, EditStageProps } from './types'
import { useCommittedLevel } from './useCommittedLevel'

export const EditStageView = ({ records, session, chainId, account, navigate }: EditStageProps) => {
  const { t } = useTranslation()
  const clientState = useRecoveryClient(account)
  const reads = useOverviewReads({ client: clientState, records, chainId, account })
  const kit = clientState.status === 'ready' ? clientState.client : null
  const setupState = reads.facts.status === 'answered' ? reads.facts.value.setup : null
  const committedLevel = useCommittedLevel(kit, setupState)
  const addressBook = useMemo(() => addressBookOf(WALLET_RECOVERY_CHAIN), [])

  const configuration = reads.path.kind === 'readable' ? reads.path.configuration : null
  const level = committedLevel.level.status === 'answered' ? committedLevel.level.value : null
  // The password lives in memory, outside React: a successful unlock moves the reads and renders again.
  const passwordHeld = readRecoveryPassword(chainId, account) !== undefined
  const canOpen = !!configuration && !!setupState && !!level && (level === 'public' || passwordHeld)

  const [opened, setOpened] = useState<EditSession | null>(null)
  const [openFailed, setOpenFailed] = useState(false)
  const [openRound, setOpenRound] = useState(0)
  const [draft, setDraft] = useState<SetupDraft | null>(null)
  const [stage, setStage] = useState<EditStage>('path')
  // The recovery password the committed setup opens with, as this tab verified it.
  const committedPassword = useRef<string | undefined>(undefined)

  // Every write of the draft, by the editor or a value's step, reaches the changes.
  const observed = useMemo<WalletRecords>(
    () => ({
      ...records,
      setup: (onChain, holder) => {
        const inner = records.setup(onChain, holder)
        return {
          ...inner,
          writeDraftAndPath: async (next) => {
            const written = await inner.writeDraftAndPath(next)
            setDraft(next)
            return written
          }
        }
      }
    }),
    [records]
  )
  const setupRecords = useMemo(() => observed.setup(chainId, account), [observed, chainId, account])

  useEffect(() => {
    if (!canOpen || !configuration || !setupState || !level || opened) {
      return undefined
    }
    let live = true
    setOpenFailed(false)
    const open = async () => {
      const held = await records.saveInFlight(chainId, account).read()
      if (!live) {
        return
      }
      if (held.status === 'present') {
        const intent = intentOfRequest(held.value.requestId)
        if (intent === 'manageRemove') {
          navigate(WEB_ROUTES.socialRecoveryManageRemove)
        } else if (intent === 'manageEdit') {
          navigate(WEB_ROUTES.socialRecoveryManageReview)
        } else {
          navigate(WEB_ROUTES.socialRecoveryManage)
        }
        return
      }
      const editing = await openEditSession({
        setup: setupRecords,
        session,
        state: setupState,
        configuration,
        level
      })
      const stored = await setupRecords.setupDraft.read()
      if (!live) {
        return
      }
      if (stored.status !== 'present') {
        throw new Error('The edit opened with no setup draft.')
      }
      committedPassword.current = readRecoveryPassword(chainId, account)
      if (editing.password === 'kept') {
        dropNewPassword(chainId, account)
      }
      setOpened(editing)
      setDraft(stored.value)
    }
    open().catch(() => {
      if (live) {
        setOpenFailed(true)
      }
    })
    return () => {
      live = false
    }
    // The session opens once per answered read; a later read of the same setup opens nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canOpen, opened, openRound])

  const markPassword = useCallback(
    (password: EditSession['password']) => {
      if (!opened || opened.password === password) {
        return
      }
      const next = { ...opened, password }
      setOpened(next)
      session.write(next).catch(() => undefined)
    },
    [opened, session]
  )

  // The privacy step keeps the password it was given in the shared holder; a new one moves to
  // the edit's own, and the holder gets the committed one back for the setup as it stands.
  const afterPrivacy = useCallback(async () => {
    const stored = await setupRecords.setupDraft.read()
    const hidden = stored.status === 'present' && privacyLevelOf(stored.value.privacy) !== 'public'
    const typed = readRecoveryPassword(chainId, account)
    const committed = committedPassword.current
    if (hidden && typed !== undefined && typed !== committed) {
      holdNewPassword(chainId, account, typed)
      markPassword('changed')
    } else if (!hidden) {
      dropNewPassword(chainId, account)
      markPassword('kept')
    }
    if (committed !== undefined) {
      setRecoveryPassword(chainId, account, committed)
    } else {
      wipeRecoveryPassword(chainId, account)
    }
  }, [setupRecords, chainId, account, markPassword])

  const editorNavigate = useCallback((to: string) => navigate(editorTargetOf(to)), [navigate])
  const stepNavigate = useCallback(
    (to: string) => {
      if (isPrivacyContinue(to)) {
        afterPrivacy()
          .catch(() => undefined)
          .finally(() => setStage('path'))
        return
      }
      setStage('path')
    },
    [afterPrivacy]
  )

  const onNewPassword = useCallback(
    (password: string) => {
      holdNewPassword(chainId, account, password)
      markPassword('changed')
      setStage('path')
    },
    [chainId, account, markPassword]
  )

  // A write in flight keeps the edit it sends; the overview then shows that write.
  const onCancel = useCallback(async () => {
    const dropped = await records.startOverSetup(chainId, account).then(
      () => true,
      () => false
    )
    if (dropped) {
      await session.wipe().catch(() => undefined)
      dropNewPassword(chainId, account)
    }
    if (committedPassword.current !== undefined) {
      setRecoveryPassword(chainId, account, committedPassword.current)
    }
    navigate(WEB_ROUTES.socialRecoveryManage)
  }, [records, session, chainId, account, navigate])

  const editorClient = useMemo<EditorClient>(() => {
    if (kit) {
      return { status: 'ready', setup: kit.setup }
    }
    if (clientState.status === 'update-the-wallet') {
      return { status: 'update-the-wallet', retry: clientState.retry }
    }
    if (clientState.status === 'failed') {
      return { status: 'failed', retry: clientState.retry }
    }
    return { status: 'loading' }
  }, [kit, clientState])

  const rows = useMemo(
    () =>
      opened && draft
        ? changesOf({
            baseline: opened,
            draft,
            passwordChanged: passwordChangedOf(opened, draft, opened.password),
            ruleOf: ruleOfPath(addressBook, t)
          })
        : [],
    [opened, draft, addressBook, t]
  )
  const stillNeeded = useMemo(() => stillNeededOf(draft?.clauses ?? []), [draft])
  const heading = useMemo(() => ({ title: t(`${EDITOR}.title`), lead: t(`${EDITOR}.lead`) }), [t])
  // The path and the value steps draw their own title; every other state draws the page's.
  const stageTitled = canOpen && !openFailed && !!opened && !!draft && stage !== 'password'

  const retryOpen = useCallback(() => setOpenRound((round) => round + 1), [])
  const toPath = useCallback(() => setStage('path'), [])
  // The draft of an edit that opened, where opening it did not fail.
  const openDraft = !openFailed && opened ? draft : null

  return (
    <View testID="manage-edit">
      {!stageTitled && (
        <PageTitle title={heading.title} lead={heading.lead} titleTestID="manage-edit-title" />
      )}
      <ReadsGate
        reads={reads}
        level={committedLevel.level}
        onRetryLevel={committedLevel.retry}
        passwordHeld={passwordHeld}
        testID="manage-edit-reads"
      >
        <View style={spacings.mtSm}>
          {openFailed && <EditOpenFailed onRetry={retryOpen} />}
          {!openFailed && !openDraft && <ActivityIndicator testID="manage-edit-opening" />}
          {!!openDraft && stage === 'wait' && (
            <WaitingPeriodView
              records={observed}
              chainId={chainId}
              account={account}
              navigate={stepNavigate}
            />
          )}
          {!!openDraft && stage === 'privacy' && (
            <PrivacyView
              records={observed}
              chainId={chainId}
              account={account}
              navigate={stepNavigate}
            />
          )}
          {!!openDraft && stage === 'password' && (
            <PasswordChange onDone={onNewPassword} onCancel={toPath} />
          )}
          {!!openDraft && stage === 'path' && (
            <EditPath
              records={setupRecords}
              client={editorClient}
              addressBook={addressBook}
              navigate={editorNavigate}
              stillNeeded={stillNeeded}
              heading={heading}
              draft={openDraft}
              rows={rows}
              onStage={setStage}
              onCancel={onCancel}
            />
          )}
        </View>
      </ReadsGate>
    </View>
  )
}

const EditScreen = () => {
  const { navigate } = useNavigation()
  const { account } = useSetupAccount()
  const records = useMemo(() => createWalletRecords({ storage: extensionRecordStorage }), [])
  const chainId = CHAIN_IDS[WALLET_RECOVERY_CHAIN]
  const session = useMemo(
    () => (account ? editSessionOf(extensionRecordStorage, chainId, account) : null),
    [account, chainId]
  )

  return (
    <SetupChrome testID="manage-edit-screen">
      {/* Another account mounts a new stage, so no read or edit carries across. */}
      {!!account && !!session && (
        <EditStageView
          key={`${chainId}:${account}`}
          records={records}
          session={session}
          chainId={chainId}
          account={account}
          navigate={navigate}
        />
      )}
    </SetupChrome>
  )
}

export default React.memo(EditScreen)
