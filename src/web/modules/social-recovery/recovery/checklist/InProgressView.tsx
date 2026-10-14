/**
 * The recoveries this device started and did not submit, each with its two
 * actions: continue goes to the checklist where this device still holds the
 * unlocked path, and through the readout's password ask where it does not;
 * abandon wipes the session and its entry. With no live session left, the
 * holder goes to the recovery's entry.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'

import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { PageTitle, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import type { RecoveryRoute } from '@web/modules/social-recovery/shared/records'

import { inProgressItemsOf, routeOfItems } from './inProgress'
import InProgressRow from './InProgressRow'
import { checklistPathOf, readoutPathOf, routeEntryPathOf } from './search'
import type { InProgressItem, InProgressLoad, InProgressViewProps } from './types'

const IN_PROGRESS = 'socialRecovery.inProgress'

const InProgressView = ({
  records,
  chainId,
  navigate,
  timeZone,
  holdsPath,
  useHeadline,
  onRoute
}: InProgressViewProps) => {
  const { t } = useTranslation()
  const [load, setLoad] = useState<InProgressLoad>({ status: 'loading' })
  const [holds, setHolds] = useState<Record<string, boolean>>({})
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [abandonFailed, setAbandonFailed] = useState(false)
  const routeRef = useRef<RecoveryRoute>('logged-in')

  useEffect(() => {
    let live = true
    setLoad({ status: 'loading' })
    Promise.all([records.listRecoverySessions(chainId), records.listRecoveryEntries(chainId)])
      .then(async ([sessions, entries]) => {
        const items = inProgressItemsOf(sessions, entries)
        if (!live) {
          return
        }
        if (items.length === 0) {
          navigate(routeEntryPathOf(routeRef.current), { replace: true })
          return
        }
        setLoad({ status: 'ready', items })
        routeRef.current = routeOfItems(items)
        onRoute?.(routeRef.current)
        const held = await Promise.all(
          items.map(
            async (item) => [item.account.toLowerCase(), await holdsPath(item.account)] as const
          )
        )
        if (live) {
          setHolds(Object.fromEntries(held))
        }
      })
      .catch(() => {
        if (live) {
          setLoad({ status: 'failed' })
        }
      })
    return () => {
      live = false
    }
    // The route is reported once per read of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, chainId, navigate, holdsPath, attempt])

  const onContinue = useCallback(
    (item: InProgressItem, held: boolean) =>
      navigate(held ? checklistPathOf(item.account) : readoutPathOf(item.account)),
    [navigate]
  )

  const onAbandon = useCallback(
    async (item: InProgressItem) => {
      setBusy(true)
      setAbandonFailed(false)
      try {
        await records.wipeRecoverySession(
          chainId,
          item.account,
          'recoverer-abandoned',
          item.revision
        )
      } catch {
        setAbandonFailed(true)
      } finally {
        setBusy(false)
        setAttempt((n) => n + 1)
      }
    },
    [records, chainId]
  )

  const title = (
    <PageTitle
      title={t(`${IN_PROGRESS}.title`)}
      lead={t(`${IN_PROGRESS}.lead`)}
      titleTestID="in-progress-title"
    />
  )

  if (load.status === 'failed') {
    return (
      <View testID="in-progress">
        {title}
        <Alert
          testID="in-progress-failed"
          type="error"
          size="sm"
          title={t('socialRecovery.wait.readFailedTitle')}
          text={t('socialRecovery.client.unavailableBody')}
        >
          <View style={spacings.mtTy}>
            <Button
              testID="in-progress-retry"
              type="secondary"
              size="small"
              text={t('socialRecovery.writes.tryAgain')}
              onPress={() => setAttempt((n) => n + 1)}
              hasBottomSpacing={false}
            />
          </View>
        </Alert>
      </View>
    )
  }

  if (load.status === 'loading') {
    return (
      <View testID="in-progress">
        {title}
        <ActivityIndicator testID="in-progress-loading" />
      </View>
    )
  }

  return (
    <View testID="in-progress">
      {title}
      {abandonFailed && (
        <Alert
          testID="in-progress-abandon-failed"
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={t('socialRecovery.checklist.writeFailed')}
        />
      )}
      {load.items.map((item) => (
        <InProgressRow
          key={item.account}
          item={item}
          holds={holds[item.account.toLowerCase()]}
          useHeadline={useHeadline}
          timeZone={timeZone}
          busy={busy}
          onContinue={onContinue}
          onAbandon={(abandoned) => {
            onAbandon(abandoned).catch(() => undefined)
          }}
        />
      ))}
      <SectionCard tone="muted" spacing="item" style={spacings.mtSm}>
        <Text fontSize={14} weight="medium">
          {t(`${IN_PROGRESS}.onlyThisDeviceTitle`)}
        </Text>
        <Text fontSize={14} style={spacings.mtTy}>
          {t(`${IN_PROGRESS}.onlyThisDeviceBody`)}
        </Text>
      </SectionCard>
    </View>
  )
}

export default React.memo(InProgressView)
