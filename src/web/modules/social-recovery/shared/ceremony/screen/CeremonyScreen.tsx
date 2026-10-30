/**
 * The ceremony tab: the full tab every ceremony that dies on focus loss runs
 * in. It reads its ceremony from the route's search params, resolves it
 * through the injected source, runs the host of its call, reports the outcome
 * through the return channel once the tab is visible, and returns to
 * `returnTo` where the caller named one.
 *
 * A report that storage refuses stays in memory: the tab shows the delivery
 * failure and offers a retry that writes the report again and runs no second
 * ceremony.
 *
 * Each binding runs the page's own device: the passkey through the browser,
 * the zkPassport request through the code the holder's phone scans, and the
 * Aadhaar proof over the QR image the holder uploads.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import { useLocation, useNavigate } from 'react-router-dom'

import Button from '@common/components/Button'
import Panel from '@common/components/Panel'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import Header from '@common/modules/header/components/Header'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  TabLayoutContainer,
  TabLayoutWrapperMainContent
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import type { DeviceBinding } from '@kohaku-eth/social-recovery'
import { TwoColumn } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import { renderChip } from '@web/modules/social-recovery/shared/display'
import { getUiType } from '@web/utils/uiType'

import { sendCeremonyReport, sweepCeremonyReports } from '../channel'
import { externalAppDevice } from '../externalAppDevice'
import { inBrowserProverDevice } from '../inBrowserProverDevice'
import { qrDataOfImage } from '../qrImage'
import { parseCeremonySearch } from '../request'
import { ceremonyMayRun, runCeremony } from '../run'
import type {
  CeremonyAnswer,
  CeremonyAsk,
  CeremonyOutcome,
  CeremonyParams,
  CeremonyRefusal,
  CeremonyStep,
  CeremonyValue,
  CeremonyView,
  ReportStore,
  ResolvedCeremony,
  VisibilityGate
} from '../types'
import { dismissed, notSupported, unavailable } from '../verdicts'
import { createVisibilityGate, whenVisible } from '../visibility'
import { browserPasskeyDevice, browserReportKeys, browserReportStore } from './browserDefaults'
import { useCeremonySource } from './CeremonySource'
import OutcomeBlock from './OutcomeBlock'
import ProverBlock from './ProverBlock'
import ScanBlock from './ScanBlock'
import type { Phase } from './types'
import UploadBlock from './UploadBlock'

/** The steps of the in-page prover that show a progress line. */
const PROVER_STEPS: readonly CeremonyStep[] = ['fetchingFiles', 'proving', 'checking']

const QR_IMAGE_TYPES = 'image/png,image/jpeg'

const CeremonyScreen = () => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const source = useCeremonySource()

  const parsed = useMemo(() => parseCeremonySearch(location.search), [location.search])
  const mayRun = useMemo(() => ceremonyMayRun(getUiType()), [])

  const [phase, setPhase] = useState<Phase>('resolving')
  const [step, setStep] = useState<CeremonyStep>('preparing')
  const [binding, setBinding] = useState<DeviceBinding | null>(null)
  const [outcome, setOutcome] = useState<CeremonyOutcome<CeremonyValue> | null>(null)
  const [reportHeld, setReportHeld] = useState(false)
  const [view, setView] = useState<CeremonyView | null>(null)
  const [asking, setAsking] = useState<CeremonyAsk | null>(null)
  const [noQrFound, setNoQrFound] = useState(false)

  const mounted = useRef(true)
  const started = useRef(false)
  const abort = useRef<AbortController | null>(null)
  const gate = useRef<VisibilityGate | null>(null)
  // The answer a device's pending ask waits for.
  const answerAsk = useRef<((answer: CeremonyAnswer) => void) | null>(null)
  // The count of images picked; only the latest pick's decode answers the ask.
  const imagePicks = useRef(0)
  // The store the gate serves, read each time a report is handed to the gate,
  // so a run that began before a new store arrived writes to the new one.
  const reportStore = useRef<ReportStore>(source.store ?? browserReportStore)
  const visibility = source.visibility ?? (typeof document !== 'undefined' ? document : undefined)

  useEffect(() => {
    if (visibility) {
      gate.current = createVisibilityGate(visibility)
    }
    // Reports nobody took within their expiry leave storage. A removal is a
    // storage write, so it waits for the tab to be shown.
    const store = source.store ?? browserReportStore
    reportStore.current = store
    const sweep = () => browserReportKeys().then((keys) => sweepCeremonyReports(store, keys))
    const sweeping = gate.current ? gate.current.dispatch(sweep) : sweep()
    sweeping.catch(() => undefined)
    return () => {
      gate.current?.dispose()
      gate.current = null
    }
  }, [visibility, source.store])

  // Only an unmount aborts the running ceremony: a new store or document above
  // replaces the gate and leaves the holder's attempt running. The start flag
  // resets too, so the remount of React's StrictMode starts the one run.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      started.current = false
      abort.current?.abort()
      answerAsk.current?.({ kind: 'cancelled' })
    }
  }, [])

  const answer = useCallback((given: CeremonyAnswer) => {
    const resolve = answerAsk.current
    answerAsk.current = null
    setAsking(null)
    setNoQrFound(false)
    resolve?.(given)
  }, [])

  // The holder's Cancel or Stop: aborts the run and ends an upload that waits.
  const cancelRun = useCallback(() => {
    abort.current?.abort()
    answer({ kind: 'cancelled' })
  }, [answer])

  const chooseImage = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = QR_IMAGE_TYPES
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        return
      }
      imagePicks.current += 1
      const pick = imagePicks.current
      const current = () => mounted.current && pick === imagePicks.current
      qrDataOfImage(file)
        .then((qrData) => {
          if (!current() || !answerAsk.current) {
            return
          }
          if (qrData === undefined) {
            setNoQrFound(true)
            return
          }
          answer({ kind: 'qrData', qrData })
        })
        .catch(() => {
          if (current()) {
            setNoQrFound(true)
          }
        })
    })
    input.click()
  }, [answer])

  /**
   * Writes the report of `result` and returns to `returnTo`. A write that
   * storage refuses while the tab stays open leaves `result` in memory and
   * shows the delivery failure, whose retry calls this again with the same
   * result and runs no second ceremony.
   */
  const deliver = useCallback(
    async (params: CeremonyParams, result: CeremonyOutcome<CeremonyValue>) => {
      const held = gate.current
      if (!mounted.current || !held) {
        return
      }
      setPhase('reporting')

      // The report is stamped inside the gate, when it is written.
      const sending = sendCeremonyReport(params, result, {
        store: reportStore.current,
        gate: held
      })
      setReportHeld(held.pending() > 0)
      try {
        await sending
      } catch {
        // The tab closed first, and its gate dropped the held write.
        if (!mounted.current) {
          return
        }
        // The tab stays open: storage refused the write, or the gate it waited
        // in was replaced. The retry writes through the current gate.
        setReportHeld(false)
        setPhase('undelivered')
        return
      }
      if (!mounted.current) {
        return
      }
      setReportHeld(false)
      setPhase('done')
      if (params.returnTo) {
        navigate(params.returnTo, { replace: true })
      }
    },
    [navigate]
  )

  const start = useCallback(async () => {
    if (!parsed.ok || !mayRun) {
      return
    }
    const { params } = parsed
    const controller = new AbortController()
    abort.current = controller
    // A run ends where the tab unmounted or a newer run took its place, as the
    // remount of StrictMode does before the first run dispatched anything.
    const live = () => mounted.current && abort.current === controller
    setOutcome(null)
    setStep('preparing')
    setPhase('resolving')
    setView(null)
    answer({ kind: 'cancelled' })

    // A hidden tab dispatches nothing: not the resolve, not the prompt, which
    // the browser refuses without focus anyway.
    if (visibility) {
      await whenVisible(visibility)
    }
    if (!live()) {
      return
    }

    // A source with no resolver holds no implementation to run.
    let result: CeremonyOutcome<CeremonyValue> = notSupported('no-implementation')
    if (source.resolve) {
      let resolved: ResolvedCeremony | CeremonyRefusal | null | undefined
      try {
        resolved = await source.resolve(params)
      } catch {
        // A Cancel pressed while the resolve ran wins. Otherwise the records or
        // the client did not answer: retry may find them.
        result = controller.signal.aborted
          ? dismissed('cancelled', 'AbortError')
          : unavailable('service-unanswered')
      }
      if (resolved === null) {
        if (live()) {
          setPhase('nothing')
        }
        return
      }
      if (resolved && 'refused' in resolved) {
        // The request names a method this build holds no implementation of.
        result = notSupported(resolved.refused)
      } else if (resolved) {
        if (!live()) {
          return
        }
        setBinding(resolved.method.deviceBinding)
        if (visibility) {
          await whenVisible(visibility)
        }
        if (!live()) {
          return
        }
        setPhase('running')
        result = await runCeremony(params, resolved, {
          devices: {
            'browser-authenticator': browserPasskeyDevice(),
            'external-app': externalAppDevice(),
            'in-browser-prover': inBrowserProverDevice()
          },
          signal: controller.signal,
          onStep: (next) => {
            if (live()) {
              setStep(next)
            }
          },
          show: (shown) => {
            if (live()) {
              setView(shown)
            }
          },
          ask: (asked) =>
            new Promise<CeremonyAnswer>((resolve) => {
              if (!live() || controller.signal.aborted) {
                resolve({ kind: 'cancelled' })
                return
              }
              answerAsk.current = resolve
              setNoQrFound(false)
              setAsking(asked)
            })
        })
      }
    }
    if (!live() || !gate.current) {
      return
    }
    setOutcome(result)
    await deliver(params, result)
  }, [parsed, mayRun, source, visibility, deliver, answer])

  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    start()
  }, [start])

  const renderRunning = () => {
    if (asking?.kind === 'qrImage') {
      return <UploadBlock noQrFound={noQrFound} onChoose={chooseImage} onCancel={cancelRun} />
    }
    const phoneReads =
      binding === 'external-app' && parsed.ok && parsed.params.call === 'createClaim'
    if (binding === 'external-app' && view?.kind === 'scanCode') {
      return <ScanBlock url={view.url} step={step} phoneReads={phoneReads} onCancel={cancelRun} />
    }
    if (binding === 'in-browser-prover' && PROVER_STEPS.includes(step)) {
      return <ProverBlock step={step} onStop={cancelRun} />
    }
    if (step === 'waitingForPhone') {
      return <ScanBlock step={step} phoneReads={phoneReads} onCancel={cancelRun} />
    }
    // Nothing, where the body is the running wait.
    return null
  }

  // The running wait fills the panel and centres in it, outside the columns.
  const renderWaiting = () => (
    <View style={[flexbox.flex1, flexbox.alignCenter]} testID="ceremony-waiting">
      <LoadingBlock
        variant="screen"
        message={
          // The request opens until the first step past the host's own preparing.
          phase === 'resolving' || step === 'preparing'
            ? t('socialRecovery.loading.request')
            : renderChip('method', 'inProgress', t)
        }
      />
      <Button
        type="secondary"
        text={t('socialRecovery.ceremony.cancelAction')}
        onPress={cancelRun}
        style={spacings.mtLg}
      />
    </View>
  )

  const renderBody = () => {
    if (!mayRun) {
      return <Text>{t('socialRecovery.ceremony.tabOnly')}</Text>
    }
    if (!parsed.ok || phase === 'nothing') {
      return (
        <View>
          <Text style={spacings.mbLg}>{t('socialRecovery.ceremony.nothingToRun')}</Text>
          <Button
            type="secondary"
            text={t('socialRecovery.ceremony.backAction')}
            onPress={() => navigate(-1)}
          />
        </View>
      )
    }
    if (outcome) {
      const { params } = parsed
      return (
        <OutcomeBlock
          outcome={outcome}
          params={params}
          binding={binding}
          phase={phase}
          reportHeld={reportHeld}
          onBack={() => navigate(-1)}
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onDeliverAgain={() => deliver(params, outcome)}
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onTryAgain={start}
        />
      )
    }
    return renderRunning()
  }

  const body = renderBody()

  return (
    <TabLayoutContainer
      backgroundColor={theme.secondaryBackground}
      header={<Header mode="custom-inner-content" withAmbireLogo />}
    >
      <TabLayoutWrapperMainContent withScroll={false}>
        <Panel spacingsSize="small">
          {body === null ? (
            renderWaiting()
          ) : (
            <TwoColumn testID="ceremony-columns">{body}</TwoColumn>
          )}
        </Panel>
      </TabLayoutWrapperMainContent>
    </TabLayoutContainer>
  )
}

export default React.memo(CeremonyScreen)
