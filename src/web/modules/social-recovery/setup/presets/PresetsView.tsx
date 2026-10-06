/**
 * The screen setup lands on: the three costs and the honesty note, then either
 * the grid of presets with the empty start, or, for a holder with an
 * unfinished draft, the draft's age with resume and start over. A pick writes
 * its draft and opens the editor; nothing is enrolled, refused or saved here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, View } from 'react-native'

import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
import Alert from '@common/components/Alert'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  MethodRow,
  NoteBox,
  PageTitle,
  RadioCard,
  SectionCard,
  SectionLabel,
  StatusChip
} from '@web/modules/social-recovery/shared/chrome'
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

  const renderPreset = (preset: Preset) => {
    const rows = shapeRowsOf(preset, t)
    const members = rows.flatMap((row) => (row.kind === 'group' ? row.members : []))
    return (
      <RadioCard
        key={preset.id}
        testID={`preset-${preset.id}`}
        selected={picked === preset.id}
        onPress={() => setPicked(preset.id)}
      >
        <Text fontSize={16} weight="medium" style={spacings.mbTy}>
          {t(preset.nameKey)}
        </Text>
        <View style={[flexbox.directionRow, flexbox.wrap, flexbox.alignCenter]}>
          {rows.map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <React.Fragment key={index}>
              {index > 0 && (
                <Text
                  fontSize={12}
                  weight="semiBold"
                  appearance="secondaryText"
                  style={spacings.mhTy}
                >
                  {t('socialRecovery.shape.and')}
                </Text>
              )}
              {row.kind === 'required' ? (
                <Text fontSize={14}>{row.text}</Text>
              ) : (
                <Text fontSize={14} weight="medium">
                  {row.count}
                </Text>
              )}
            </React.Fragment>
          ))}
        </View>
        {members.map((member, memberIndex) => (
          // eslint-disable-next-line react/no-array-index-key
          <Text key={memberIndex} fontSize={12} appearance="secondaryText">
            {member}
          </Text>
        ))}
        {cardRuleLines(preset, t).map((line) => (
          <Text
            key={line}
            testID={`rule-line-${preset.id}`}
            fontSize={12}
            appearance="secondaryText"
            style={spacings.mtTy}
          >
            {line}
          </Text>
        ))}
        {!!preset.taglineKey && (
          <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
            {t(preset.taglineKey)}
          </Text>
        )}
      </RadioCard>
    )
  }

  const renderGrid = () => (
    <View testID="presets-grid">
      <Button
        testID="customize"
        type="secondary"
        size="small"
        text={t('socialRecovery.presets.customize')}
        disabled={busy}
        onPress={() => open('fromScratch')}
        hasBottomSpacing={false}
        style={{ alignSelf: 'flex-start', ...spacings.mbLg }}
      />
      <SectionLabel>{t('socialRecovery.presets.pickOne')}</SectionLabel>
      {PRESETS.map(renderPreset)}
      <RadioCard
        testID="preset-fromScratch"
        selected={picked === 'fromScratch'}
        onPress={() => setPicked('fromScratch')}
      >
        <Text fontSize={16} weight="medium" style={spacings.mbTy}>
          {t('socialRecovery.presets.cards.fromScratch.name')}
        </Text>
        <Text fontSize={12} appearance="secondaryText">
          {t('socialRecovery.presets.cards.fromScratch.line')}
        </Text>
        <Text fontSize={12} appearance="secondaryText">
          {t('socialRecovery.presets.cards.fromScratch.oneDevice')}
        </Text>
      </RadioCard>
      <ActionsRow
        primary={
          <Button
            testID="continue"
            text={t('socialRecovery.actions.continue')}
            disabled={!picked || busy}
            onPress={() => picked && open(picked)}
            hasBottomSpacing={false}
          />
        }
        note={picked ? undefined : t('socialRecovery.presets.continueUnlock')}
      />
    </View>
  )

  const renderResumeRow = (row: ResumeRow) => (
    <MethodRow
      key={row.id}
      testID="resume-row"
      style={[flexbox.directionRow, flexbox.justifySpaceBetween, flexbox.alignStart]}
    >
      <View style={[flexbox.flex1, spacings.mrSm]}>
        <Text fontSize={14} weight="medium">
          {row.name}
        </Text>
        {!!row.detail && (
          <Text fontSize={12} appearance="secondaryText" style={spacings.mtMi}>
            {row.detail}
          </Text>
        )}
        {!!row.note && (
          <Text testID="resume-note" fontSize={12} appearance="secondaryText" style={spacings.mtMi}>
            {row.note}
          </Text>
        )}
      </View>
      <StatusChip testID="resume-chip" text={row.chip} />
    </MethodRow>
  )

  const renderResume = (at: number) => (
    <SectionCard testID="presets-resume">
      <Text fontSize={16} weight="medium" style={spacings.mbTy}>
        {t('socialRecovery.presets.resume.action')}
      </Text>
      <Text testID="draft-age" fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
        {draftAgeLine(at, t)}
      </Text>
      {resumeRows.map(renderResumeRow)}
      {!!notYetActive && (
        <MethodRow
          testID="not-yet-active"
          style={[flexbox.directionRow, flexbox.justifySpaceBetween, flexbox.alignStart]}
        >
          <Text fontSize={12} appearance="secondaryText" style={[flexbox.flex1, spacings.mrSm]}>
            {notYetActive.note}
          </Text>
          <StatusChip text={notYetActive.chip} />
        </MethodRow>
      )}
      {notStartedRows.map(renderResumeRow)}
      <ActionsRow
        primary={
          <Button
            testID="resume"
            text={t('socialRecovery.presets.resume.action')}
            disabled={busy}
            onPress={onOpenEditor}
            hasBottomSpacing={false}
          />
        }
        secondary={
          <Button
            testID="start-over"
            type="secondary"
            size="small"
            text={t('socialRecovery.presets.resume.startOver')}
            disabled={busy}
            onPress={startOver}
            hasBottomSpacing={false}
          />
        }
        note={t('socialRecovery.records.startOverNote')}
      />
    </SectionCard>
  )

  const renderLoadFailed = () => (
    <View testID="presets-load-failed">
      <Alert type="error" size="sm" text={t('socialRecovery.records.loadFailed')}>
        <ActionsRow
          primary={
            <Button
              testID="load-retry"
              type="secondary"
              size="small"
              text={t('socialRecovery.writes.tryAgain')}
              disabled={busy}
              onPress={reload}
              hasBottomSpacing={false}
            />
          }
          secondary={
            <Button
              testID="start-over"
              type="secondary"
              size="small"
              text={t('socialRecovery.presets.resume.startOver')}
              disabled={busy}
              onPress={startOver}
              hasBottomSpacing={false}
            />
          }
        />
      </Alert>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
        {t('socialRecovery.records.startOverNote')}
      </Text>
    </View>
  )

  return (
    <View testID="presets-screen">
      <PageTitle title={t('socialRecovery.routes.setup')} lead={t('socialRecovery.presets.lead')} />
      <SectionCard
        tone="muted"
        style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}
      >
        <Text fontSize={16} weight="medium" style={spacings.mrSm}>
          {t('socialRecovery.routes.root')}
        </Text>
        <StatusChip testID="recovery-status" text={renderChip('recovery', 'notSetUp', t)} />
      </SectionCard>
      <View testID="cost-lines" style={spacings.mbSm}>
        {COST_KEYS.map((key) => (
          <Text key={key} fontSize={14} style={spacings.mbTy}>
            {t(key)}
          </Text>
        ))}
      </View>
      <View style={spacings.mbLg}>
        <NoteBox testID="honesty-note">{t('socialRecovery.honestyNote')}</NoteBox>
      </View>
      {writeLine === 'writeFailed' && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID="write-failed">
              {t('socialRecovery.records.writeFailed')}
            </Alert.Text>
          }
        />
      )}
      {writeLine === 'startOverWhileSaving' && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbSm}
          text={
            <Alert.Text size="sm" type="error" testID="start-over-while-saving">
              {t('socialRecovery.records.startOverWhileSaving')}
            </Alert.Text>
          }
        />
      )}
      {loadFailed && renderLoadFailed()}
      {!loadFailed && savedAt === null && renderGrid()}
      {!loadFailed && typeof savedAt === 'number' && renderResume(savedAt)}
      <Pressable
        testID="recover"
        accessibilityRole="button"
        onPress={onRecover}
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          common.borderRadiusSecondary,
          spacings.ph,
          spacings.pv,
          spacings.mtLg,
          { borderWidth: 1, borderColor: theme.secondaryBorder }
        ]}
      >
        <View style={[flexbox.flex1, spacings.mrSm]}>
          <Text fontSize={16} weight="medium">
            {t('socialRecovery.routes.recover')}
          </Text>
          <Text fontSize={12} appearance="secondaryText">
            {t('socialRecovery.presets.recoverLine')}
          </Text>
        </View>
        <RightArrowIcon />
      </Pressable>
    </View>
  )
}

export default React.memo(PresetsView)
