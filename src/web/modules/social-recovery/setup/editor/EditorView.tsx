/**
 * The setup editor over the draft record. Every edit runs one of the pure
 * operations, writes the draft and the path together, and keeps the path equal
 * to the draft's clauses. A credential the path already holds is refused
 * before the record changes. Continue first judges the path's shape against
 * this wallet's own rules and, with a refusal, stays and names it without
 * running the SDK's path check; otherwise it runs the check and opens the
 * waiting period only when the check finds no error. A row opens its method's
 * enrollment, and an add menu places an empty slot of the picked kind and
 * opens its enrollment.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import type { Clause, Finding, SetupDraft } from '@kohaku-eth/social-recovery'
import { ActionsRow, TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import { defaultSetupDraft } from '@web/modules/social-recovery/shared/records'
import type { SlotKind } from '@web/modules/social-recovery/shared/records'
import { getRuleLines, RULE_LINE_KEYS } from '@web/modules/social-recovery/shared/rule-lines'
import type { RuleLineKey } from '@web/modules/social-recovery/shared/rule-lines'

import EditorActions from './EditorActions'
import EditorHeader from './EditorHeader'
import EditorPath from './EditorPath'
import {
  addGroup,
  blocksContinue,
  editorErrorsOf,
  emptySlotOf,
  enrollSearchOf,
  fillOf,
  isEmptySlot,
  kindOf,
  makeItAGroup,
  makeItAGroupRoles,
  makeRequired,
  methodCountOf,
  methodKindOf,
  moveToGroup,
  offersMakeItAGroup,
  placeAt,
  placedRoles,
  readThreshold,
  removeClause,
  removeMember,
  removeMemberToFit,
  rolesOf,
  sameAddTarget,
  setThreshold,
  withClauses,
  withoutRole
} from './operations'
import { shapeRefusalsOf } from './refusals'
import RuleLines from './RuleLines'
import type {
  AddTarget,
  ClauseRole,
  ClientRefusal,
  EditorLoad,
  EditorViewProps,
  EditResult,
  HeldThresholds,
  Refusal,
  SlotPosition
} from './types'

/** The lines that offer a second method; while one shows, the path offers the button that adds it. */
const SECOND_METHOD_OFFERS: readonly RuleLineKey[] = [
  RULE_LINE_KEYS.secondMethodOffer,
  RULE_LINE_KEYS.secondMethodOfferAny
]

const EditorView = ({
  records,
  client,
  addressBook,
  navigate,
  stillNeeded,
  plainRemoval,
  heading,
  continueLabel,
  beforeActions,
  onCheckingChange
}: EditorViewProps) => {
  const { t } = useTranslation()
  const [load, setLoad] = useState<EditorLoad | null>(null)
  const [refused, setRefused] = useState(false)
  const [menu, setMenu] = useState<AddTarget | null>(null)
  const [rowChoosingGroup, setRowChoosingGroup] = useState<number | null>(null)
  const [heldThresholds, setHeldThresholds] = useState<HeldThresholds>({})
  const [findings, setFindings] = useState<Finding[]>([])
  const [walletRefusals, setWalletRefusals] = useState<Refusal[]>([])
  const [checking, setChecking] = useState(false)
  const [checkFailed, setCheckFailed] = useState(false)
  const checkingRef = useRef(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [writeFailed, setWriteFailed] = useState(false)
  const writeFailedRef = useRef(false)
  const mounted = useRef(true)
  const loadRef = useRef<EditorLoad | null>(null)
  const writes = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    onCheckingChange?.(checking)
  }, [checking, onCheckingChange])

  useEffect(() => {
    mounted.current = true
    Promise.all([records.setupDraft.read(), records.enrollments.read()])
      .then(([draft, enrollments]) => {
        const stored = draft.status === 'present' ? draft.value : defaultSetupDraft()
        const next: EditorLoad = {
          draft: stored,
          enrollments: enrollments.status === 'present' ? enrollments.value : [],
          roles: rolesOf(stored.clauses)
        }
        loadRef.current = next
        if (mounted.current) {
          setLoad(next)
        }
      })
      .catch(() => {
        if (mounted.current) {
          setLoadFailed(true)
        }
      })
    return () => {
      mounted.current = false
    }
  }, [records, loadAttempt])

  const retryLoad = () => {
    setLoadFailed(false)
    setLoadAttempt((attempt) => attempt + 1)
  }

  const clauses = useMemo(() => load?.draft.clauses ?? [], [load])

  // The draft and the path land together, each write after the one before; a
  // failed write holds continue until a later write lands.
  const persist = useCallback(
    (draft: SetupDraft) => {
      writes.current = writes.current.then(async () => {
        try {
          await records.writeDraftAndPath(draft)
          writeFailedRef.current = false
        } catch {
          writeFailedRef.current = true
        }
        if (mounted.current) {
          setWriteFailed(writeFailedRef.current)
        }
      })
    },
    [records]
  )

  const retryWrite = () => {
    const current = loadRef.current
    if (!current || checkingRef.current) {
      return
    }
    persist(current.draft)
  }

  // A clause keeps the role the edit that made it gave it, so a group that
  // loses members down to one stays a group while the holder edits. An edit
  // closes the kind menu and the group chooser, whose positions it may shift, and
  // a threshold field's held text goes back to the path's threshold unless the
  // edit keeps it.
  const commit = useCallback(
    (next: Clause[], roles: ClauseRole[], held: HeldThresholds = {}) => {
      const current = loadRef.current
      if (!current || checkingRef.current) {
        return
      }
      const draft = withClauses(current.draft, next)
      const updated = { ...current, draft, roles }
      loadRef.current = updated
      setLoad(updated)
      setRefused(false)
      setFindings([])
      setWalletRefusals([])
      setCheckFailed(false)
      setRowChoosingGroup(null)
      setMenu(null)
      setHeldThresholds(held)
      persist(draft)
    },
    [persist]
  )

  const apply = useCallback(
    (result: EditResult, rolesAt: (at: SlotPosition) => ClauseRole[]) => {
      if (checkingRef.current) {
        return null
      }
      if (result.status === 'refused') {
        setRefused(true)
        return null
      }
      commit(result.clauses, rolesAt(result.at))
      return result.at
    },
    [commit]
  )

  const thresholdHeld = Object.keys(heldThresholds).length > 0
  const current = () => loadRef.current?.draft.clauses ?? []
  const currentRoles = () => loadRef.current?.roles ?? []

  const closeMenu = useCallback(() => setMenu(null), [])

  // A second press on the control that opened a menu closes it.
  const toggleMenu = (target: AddTarget) =>
    setMenu((open) => (open && sameAddTarget(open, target) ? null : target))

  // The enroll screen reads the slot from the stored draft, so it opens once the write lands.
  const openEnroll = (kind: SlotKind, at: SlotPosition) => {
    writes.current
      .then(() => {
        if (mounted.current && !writeFailedRef.current) {
          navigate(`${WEB_ROUTES.socialRecoverySetupEnroll}${enrollSearchOf(kind, at)}`)
        }
      })
      .catch(() => undefined)
  }

  const onPickKind = (kind: SlotKind) => {
    if (!menu || checkingRef.current) {
      return
    }
    const target = menu
    const at = apply(placeAt(current(), target, emptySlotOf(kind)), (placed) =>
      placedRoles(currentRoles(), target, placed)
    )
    if (at) {
      openEnroll(kind, at)
    }
  }

  // A row of a kind the wallet reads opens that kind's enrollment for its
  // slot: the enrolled summary and its test for an enrolled method, the
  // enrollment itself for an empty slot. An empty slot of no kind it reads
  // asks for one first.
  const openSlot = (clause: number, member: number) => {
    const credential = loadRef.current?.draft.clauses[clause]?.credentials[member]
    if (!credential || checkingRef.current) {
      return
    }
    const kind = kindOf(credential, addressBook)
    if (kind) {
      setMenu(null)
      openEnroll(kind, { clause, member })
    } else if (isEmptySlot(credential)) {
      toggleMenu({ place: 'slot', clause, member })
    }
  }

  // A whole number goes to the path; any other text stays in its field and
  // holds continue, so the path the check reads is the one on screen.
  const onThresholdText = (group: number, text: string) => {
    if (checkingRef.current) {
      return
    }
    const rest = { ...heldThresholds }
    delete rest[group]
    const threshold = readThreshold(text)
    if (threshold === undefined) {
      setHeldThresholds({ ...rest, [group]: text })
      return
    }
    commit(setThreshold(current(), group, threshold), currentRoles(), rest)
  }

  const onMove = (row: number, group: number) => {
    setMenu(null)
    return apply(moveToGroup(current(), row, group), () => withoutRole(currentRoles(), row))
  }

  // Every edit holds while the check runs, so the check runs on the draft
  // the holder goes on with.
  const endCheck = () => {
    checkingRef.current = false
    if (mounted.current) {
      setChecking(false)
    }
  }

  const onContinue = async () => {
    if (client.status !== 'ready' || !loadRef.current || checkingRef.current || thresholdHeld) {
      return
    }
    const { roles } = loadRef.current
    const refusals = shapeRefusalsOf(loadRef.current.draft, roles)
    // A group's card draws its own threshold above its members, so the list
    // below the path leaves that one out; Continue still stops on it.
    setWalletRefusals(
      refusals.filter(
        (refusal) =>
          refusal.key !== 'thresholdAboveMembers' ||
          refusal.clause === undefined ||
          roles[refusal.clause] !== 'group'
      )
    )
    if (refusals.length > 0) {
      setFindings([])
      setCheckFailed(false)
      return
    }
    checkingRef.current = true
    setChecking(true)
    setCheckFailed(false)
    setFindings([])
    try {
      await writes.current
      if (writeFailedRef.current) {
        endCheck()
        return
      }
      const draft = loadRef.current.draft
      const result = await client.setup.validateSetup(draft)
      if (!mounted.current) {
        return
      }
      if (blocksContinue(result)) {
        setFindings(editorErrorsOf(result))
        endCheck()
        return
      }
      navigate(WEB_ROUTES.socialRecoverySetupWaitingPeriod)
    } catch {
      if (mounted.current) {
        setCheckFailed(true)
      }
      endCheck()
    }
  }

  const ruleLines = useMemo(
    () =>
      getRuleLines(clauses, {
        skipMemberlessClauses: true,
        kindOfMethod: (method) => methodKindOf(method, addressBook)
      }),
    [clauses, addressBook]
  )

  if (!load) {
    if (!loadFailed) {
      return <LoadingBlock variant="screen" message={t('socialRecovery.loading.draft')} />
    }
    return (
      <View testID="editor">
        <Alert
          type="error"
          size="sm"
          text={
            <Alert.Text size="sm" type="error" testID="editor-load-failed">
              {t('socialRecovery.records.loadFailed')}
            </Alert.Text>
          }
        />
        <ActionsRow
          primary={
            <Button
              testID="editor-load-retry"
              type="primary"
              text={t('socialRecovery.writes.tryAgain')}
              onPress={retryLoad}
              hasBottomSpacing={false}
            />
          }
        />
      </View>
    )
  }

  const indexed = clauses.map((clause, index) => ({ clause, index }))
  const rows = indexed.filter(({ index }) => load.roles[index] === 'required')
  const groups = indexed.filter(({ index }) => load.roles[index] === 'group')
  const methodCount = methodCountOf(clauses)
  let clientRefusal: ClientRefusal | null = null
  if (client.status === 'update-the-wallet') {
    clientRefusal = 'update-the-wallet'
  } else if (client.status === 'failed' || (client.status === 'ready' && checkFailed)) {
    clientRefusal = 'unavailable'
  }

  const aside = ruleLines.length > 0 ? <RuleLines ruleLines={ruleLines} /> : undefined

  return (
    <TwoColumn testID="editor-columns" aside={aside}>
      <View testID="editor">
        <EditorHeader fill={fillOf(clauses)} refused={refused} heading={heading} />

        <EditorPath
          rows={rows}
          groups={groups}
          heldThresholds={heldThresholds}
          rowChoosingGroup={rowChoosingGroup}
          addressBook={addressBook}
          enrollments={load.enrollments}
          checking={checking}
          menu={menu}
          onOpenSlot={openSlot}
          onPickKind={onPickKind}
          onCloseMenu={closeMenu}
          onToggleMenu={toggleMenu}
          onMove={onMove}
          onOpenGroupChoice={setRowChoosingGroup}
          onCloseGroupChoice={() => setRowChoosingGroup(null)}
          onRemove={(index) =>
            commit(removeClause(current(), index), withoutRole(currentRoles(), index))
          }
          onThresholdText={onThresholdText}
          onMakeRequired={(index, member) => {
            setMenu(null)
            apply(makeRequired(current(), index, member), () => [...currentRoles(), 'required'])
          }}
          onRemoveMember={(index, member) => {
            if (!stillNeeded?.has(`${index}:${member}`)) {
              const remove = plainRemoval ? removeMember : removeMemberToFit
              commit(remove(current(), index, member), currentRoles())
            }
          }}
          onLowerAndRemove={(index, member) => {
            const { threshold } = current()[index]
            if (stillNeeded?.has(`${index}:${member}`) && threshold > 1) {
              commit(
                setThreshold(removeMember(current(), index, member), index, threshold - 1),
                currentRoles()
              )
            }
          }}
          stillNeeded={stillNeeded}
          onRemoveGroup={(index) =>
            commit(removeClause(current(), index), withoutRole(currentRoles(), index))
          }
          onAddGroup={() => commit(addGroup(current()), [...currentRoles(), 'group'])}
          offersSecondMethod={ruleLines.some(({ key }) => SECOND_METHOD_OFFERS.includes(key))}
          canMakeItAGroup={offersMakeItAGroup(clauses)}
          // The offer counts required rows by their stored shape, so the
          // press gathers every clause that shape reads as a row.
          onMakeItAGroup={() =>
            commit(makeItAGroup(current()), makeItAGroupRoles(rolesOf(current())))
          }
        />

        {beforeActions}

        <EditorActions
          client={client}
          clientRefusal={clientRefusal}
          walletRefusals={walletRefusals}
          roles={load.roles}
          findings={findings}
          methodCount={methodCount}
          checking={checking}
          checkFailed={checkFailed}
          writeFailed={writeFailed}
          thresholdHeld={thresholdHeld}
          onRetryWrite={retryWrite}
          onContinue={onContinue}
          onBack={() => navigate(WEB_ROUTES.socialRecoverySetup)}
          continueLabel={continueLabel}
        />
      </View>
    </TwoColumn>
  )
}

export default React.memo(EditorView)
