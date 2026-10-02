/**
 * The screen setup lands on: the three costs and the honesty note, then either
 * the grid of presets with the empty start, or, for a holder with an
 * unfinished draft, the draft's age with resume and start over. A pick writes
 * its draft and opens the editor; nothing is enrolled, refused or saved here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { addressBookOf, WALLET_RECOVERY_CHAIN } from '@web/modules/social-recovery/shared/client'
import { renderChip } from '@web/modules/social-recovery/shared/display'
import { isSaveInFlightRefusal } from '@web/modules/social-recovery/shared/records'

import { startDraft } from './draft'
import { cardRuleLines, shapeRowsOf } from './lines'
import { PRESETS } from './presets'
import { draftAgeLine, notStartedRowsOf, notYetActiveOf, resumeRowsOf } from './resume'
import type {
  Preset,
  PresetChoice,
  PresetsLoad,
  PresetsViewProps,
  ResumeNote,
  ResumeRow,
  WriteLine
} from './types'

const COST_KEYS = [
  'socialRecovery.costLines.save',
  'socialRecovery.costLines.recovery',
  'socialRecovery.costLines.cancel'
] as const

const PresetsView = ({ records, chainId, account, onOpenEditor, onRecover }: PresetsViewProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  // `undefined` until the stored draft is read, `null` when there is none.
  const [savedAt, setSavedAt] = useState<number | null | undefined>(undefined)
  const [loadFailed, setLoadFailed] = useState(false)
  const [writeLine, setWriteLine] = useState<WriteLine | null>(null)
  const [resumeRows, setResumeRows] = useState<ResumeRow[]>([])
  const [notYetActive, setNotYetActive] = useState<ResumeNote | null>(null)
  const [notStartedRows, setNotStartedRows] = useState<ResumeRow[]>([])
  const [picked, setPicked] = useState<PresetChoice | null>(null)
  const [busy, setBusy] = useState(false)

  const setup = useMemo(() => records.setup(chainId, account), [records, chainId, account])

  const read = useCallback(async (): Promise<PresetsLoad> => {
    const [at, enrollments, draft] = await Promise.all([
      records.setupSavedAt(chainId, account),
      setup.enrollments.read(),
      setup.setupDraft.read()
    ])
    const book = addressBookOf(WALLET_RECOVERY_CHAIN)
    const enrolled = enrollments.status === 'present' ? enrollments.value : []
    const clauses = draft.status === 'present' ? draft.value.clauses : []
    return {
      savedAt: at,
      rows: resumeRowsOf(enrolled, book, t),
      notYetActive: notYetActiveOf(enrolled, book, t),
      notStarted: notStartedRowsOf(clauses, enrolled, book, t)
    }
  }, [records, setup, chainId, account, t])

  const show = useCallback((loaded: PresetsLoad) => {
    setResumeRows(loaded.rows)
    setNotYetActive(loaded.notYetActive)
    setNotStartedRows(loaded.notStarted)
    setSavedAt(loaded.savedAt)
  }, [])

  // A failed read shows its own state, never the cards: the holder may have a
  // draft this device could not read, and may retry or start over.
  const showFailed = useCallback(() => {
    setSavedAt(undefined)
    setLoadFailed(true)
  }, [])

  const reload = useCallback(() => {
    setLoadFailed(false)
    return read().then(show, showFailed)
  }, [read, show, showFailed])

  // A read that finishes after the account or the chain changed is dropped, so
  // it never shows one account's state, or starts a draft, for another.
  useEffect(() => {
    let cancelled = false
    setLoadFailed(false)
    read().then(
      (loaded) => {
        if (!cancelled) {
          show(loaded)
        }
      },
      () => {
        if (!cancelled) {
          showFailed()
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [read, show, showFailed])

  const open = useCallback(
    async (choice: PresetChoice) => {
      setBusy(true)
      try {
        await startDraft(setup, choice)
        setWriteLine(null)
        onOpenEditor()
      } catch {
        // A refused write changes nothing: reload and show what storage holds.
        setWriteLine('writeFailed')
        await reload()
      } finally {
        setBusy(false)
      }
    },
    [setup, onOpenEditor, reload]
  )

  const startOver = useCallback(async () => {
    setBusy(true)
    try {
      await records.startOverSetup(chainId, account)
      setWriteLine(null)
      setPicked(null)
      await reload()
    } catch (error) {
      // A save still on its way may land on the draft, so nothing was removed
      // and the screen stays as it is.
      if (isSaveInFlightRefusal(error)) {
        setWriteLine('startOverWhileSaving')
      } else {
        setWriteLine('writeFailed')
        await reload()
      }
    } finally {
      setBusy(false)
    }
  }, [records, chainId, account, reload])

  const cardStyle = (choice: PresetChoice) => [
    spacings.ph,
    spacings.pv,
    spacings.mbSm,
    common.borderRadiusPrimary,
    {
      borderWidth: 1,
      borderColor: picked === choice ? theme.primary : theme.secondaryBorder
    }
  ]

  const renderPreset = (preset: Preset) => (
    <Pressable
      key={preset.id}
      testID={`preset-${preset.id}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: picked === preset.id }}
      // The web renderer reads the checked state of a radio from this prop
      // alone; the React Native types do not declare it, so it goes in a spread.
      {...{ accessibilityChecked: picked === preset.id }}
      onPress={() => setPicked(preset.id)}
      style={cardStyle(preset.id)}
    >
      <Text fontSize={16} weight="semiBold" style={spacings.mbSm}>
        {t(preset.nameKey)}
      </Text>
      {shapeRowsOf(preset, t).map((row, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={index}>
          {index > 0 && (
            <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mbTy}>
              {t('socialRecovery.shape.and')}
            </Text>
          )}
          {row.kind === 'required' ? (
            <Text fontSize={14} style={spacings.mbTy}>
              {row.text}
            </Text>
          ) : (
            <View style={spacings.mbTy}>
              <Text fontSize={14} weight="medium">
                {row.count}
              </Text>
              {row.members.map((member, memberIndex) => (
                // eslint-disable-next-line react/no-array-index-key
                <Text key={memberIndex} fontSize={14}>
                  {member}
                </Text>
              ))}
            </View>
          )}
        </View>
      ))}
      {cardRuleLines(preset, t).map((line) => (
        <Text key={line} testID={`rule-line-${preset.id}`} fontSize={14} style={spacings.mtTy}>
          {line}
        </Text>
      ))}
      {!!preset.taglineKey && (
        <Text fontSize={14} appearance="secondaryText" style={spacings.mtTy}>
          {t(preset.taglineKey)}
        </Text>
      )}
    </Pressable>
  )

  const renderGrid = () => (
    <View testID="presets-grid">
      <Button
        testID="customize"
        type="secondary"
        text={t('socialRecovery.presets.customize')}
        disabled={busy}
        onPress={() => open('fromScratch')}
        style={spacings.mbLg}
      />
      <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mbSm}>
        {t('socialRecovery.presets.pickOne')}
      </Text>
      {PRESETS.map(renderPreset)}
      <Pressable
        testID="preset-fromScratch"
        accessibilityRole="radio"
        accessibilityState={{ checked: picked === 'fromScratch' }}
        {...{ accessibilityChecked: picked === 'fromScratch' }}
        onPress={() => setPicked('fromScratch')}
        style={cardStyle('fromScratch')}
      >
        <Text fontSize={16} weight="semiBold" style={spacings.mbSm}>
          {t('socialRecovery.presets.cards.fromScratch.name')}
        </Text>
        <Text fontSize={14} style={spacings.mbTy}>
          {t('socialRecovery.presets.cards.fromScratch.line')}
        </Text>
        <Text fontSize={14} appearance="secondaryText">
          {t('socialRecovery.presets.cards.fromScratch.oneDevice')}
        </Text>
      </Pressable>
      <Button
        testID="continue"
        text={t('socialRecovery.actions.continue')}
        disabled={!picked || busy}
        onPress={() => picked && open(picked)}
        style={spacings.mtSm}
      />
      {!picked && (
        <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
          {t('socialRecovery.presets.continueUnlock')}
        </Text>
      )}
    </View>
  )

  const renderResumeRow = (row: ResumeRow) => (
    <View
      key={row.id}
      testID="resume-row"
      style={[flexbox.directionRow, flexbox.justifySpaceBetween, spacings.mbSm]}
    >
      <View style={flexbox.flex1}>
        <Text fontSize={14}>{row.name}</Text>
        {!!row.detail && (
          <Text fontSize={12} appearance="secondaryText">
            {row.detail}
          </Text>
        )}
        {!!row.note && (
          <Text testID="resume-note" fontSize={12} appearance="secondaryText">
            {row.note}
          </Text>
        )}
      </View>
      <Text testID="resume-chip" fontSize={12} weight="medium" appearance="secondaryText">
        {row.chip}
      </Text>
    </View>
  )

  const renderResume = (at: number) => (
    <View testID="presets-resume">
      <Text fontSize={16} weight="semiBold" style={spacings.mbSm}>
        {t('socialRecovery.presets.resume.action')}
      </Text>
      <Text testID="draft-age" fontSize={14} style={spacings.mbSm}>
        {draftAgeLine(at, t)}
      </Text>
      {resumeRows.map(renderResumeRow)}
      {!!notYetActive && (
        <View
          testID="not-yet-active"
          style={[flexbox.directionRow, flexbox.justifySpaceBetween, spacings.mbSm]}
        >
          <Text fontSize={12} appearance="secondaryText" style={flexbox.flex1}>
            {notYetActive.note}
          </Text>
          <Text fontSize={12} weight="medium" appearance="secondaryText">
            {notYetActive.chip}
          </Text>
        </View>
      )}
      {notStartedRows.map(renderResumeRow)}
      <View style={[flexbox.directionRow, spacings.mtSm]}>
        <Button
          testID="resume"
          text={t('socialRecovery.presets.resume.action')}
          disabled={busy}
          onPress={onOpenEditor}
          style={spacings.mrSm}
        />
        <Button
          testID="start-over"
          type="secondary"
          text={t('socialRecovery.presets.resume.startOver')}
          disabled={busy}
          onPress={startOver}
        />
      </View>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
        {t('socialRecovery.records.startOverNote')}
      </Text>
    </View>
  )

  const renderLoadFailed = () => (
    <View testID="presets-load-failed">
      <Text fontSize={14} appearance="errorText" style={spacings.mbSm}>
        {t('socialRecovery.records.loadFailed')}
      </Text>
      <Button
        testID="load-retry"
        type="secondary"
        text={t('socialRecovery.writes.tryAgain')}
        disabled={busy}
        onPress={reload}
        style={spacings.mbSm}
      />
      <Button
        testID="start-over"
        type="secondary"
        text={t('socialRecovery.presets.resume.startOver')}
        disabled={busy}
        onPress={startOver}
      />
      <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
        {t('socialRecovery.records.startOverNote')}
      </Text>
    </View>
  )

  return (
    <View testID="presets-screen">
      <Text fontSize={20} weight="medium" style={spacings.mbSm}>
        {t('socialRecovery.routes.setup')}
      </Text>
      <Text fontSize={14} style={spacings.mbLg}>
        {t('socialRecovery.presets.lead')}
      </Text>
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbLg]}>
        <Text fontSize={14} weight="medium" style={spacings.mrSm}>
          {t('socialRecovery.routes.root')}
        </Text>
        <Text testID="recovery-status" fontSize={12} weight="medium" appearance="secondaryText">
          {renderChip('recovery', 'notSetUp', t)}
        </Text>
      </View>
      <View testID="cost-lines" style={spacings.mbSm}>
        {COST_KEYS.map((key) => (
          <Text key={key} fontSize={14} style={spacings.mbTy}>
            {t(key)}
          </Text>
        ))}
      </View>
      <Text testID="honesty-note" fontSize={14} weight="medium" style={spacings.mbLg}>
        {t('socialRecovery.honestyNote')}
      </Text>
      {writeLine === 'writeFailed' && (
        <Text testID="write-failed" fontSize={14} appearance="errorText" style={spacings.mbSm}>
          {t('socialRecovery.records.writeFailed')}
        </Text>
      )}
      {writeLine === 'startOverWhileSaving' && (
        <Text
          testID="start-over-while-saving"
          fontSize={14}
          appearance="errorText"
          style={spacings.mbSm}
        >
          {t('socialRecovery.records.startOverWhileSaving')}
        </Text>
      )}
      {loadFailed && renderLoadFailed()}
      {!loadFailed && savedAt === null && renderGrid()}
      {!loadFailed && typeof savedAt === 'number' && renderResume(savedAt)}
      <View style={spacings.mtLg}>
        <Button
          testID="recover"
          type="secondary"
          text={t('socialRecovery.routes.recover')}
          onPress={onRecover}
        />
        <Text fontSize={12} appearance="secondaryText">
          {t('socialRecovery.presets.recoverLine')}
        </Text>
      </View>
    </View>
  )
}

export default React.memo(PresetsView)
