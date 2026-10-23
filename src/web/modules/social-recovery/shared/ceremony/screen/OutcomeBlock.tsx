/**
 * A ceremony's outcome: its chip, its note and lines, the passkey's kind where
 * an enrollment passed, and the actions. A report storage refused offers to
 * write it again; a delivered report with nowhere to return to offers the way
 * back and, where the outcome allows it, another run.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { renderChip, renderHash } from '@web/modules/social-recovery/shared/display'

import { lossLineKeyOf, renderKindLine } from '../kindLine'
import type { CeremonyValue } from '../types'
import { browserErrorNameOf, chipOfOutcome, lineKeyOfOutcome, noteKeyOfOutcome } from '../verdicts'
import { pagePasskeysServed, pagePlatform } from './browserDefaults'
import type { OutcomeBlockProps } from './types'

const hashOfValue = (value: CeremonyValue): string | null => {
  if ('proof' in value) {
    return renderHash(value.proof)
  }
  if ('reply' in value) {
    return renderHash(value.reply.proof)
  }
  return null
}

const OutcomeBlock = ({
  outcome,
  params,
  binding,
  phase,
  reportHeld,
  onBack,
  onDeliverAgain,
  onTryAgain
}: OutcomeBlockProps) => {
  const { t } = useTranslation()
  const { call, returnTo } = params
  const chip = chipOfOutcome(outcome, call)
  // The holder declined the request on the phone, which the app reports as its refusal.
  const declined =
    binding === 'external-app' && outcome.kind === 'dismissed' && outcome.note === 'refused'
  const noteKey = declined
    ? 'socialRecovery.ceremony.declinedNote'
    : noteKeyOfOutcome(outcome, call)
  const lineKey = lineKeyOfOutcome(outcome, call)
  const passedEnroll =
    outcome.kind === 'verdict' && outcome.verdict === 'passed' && call === 'enroll'
  const facts = passedEnroll ? outcome.value.facts : undefined
  const hash =
    outcome.kind === 'verdict' && outcome.verdict === 'passed' ? hashOfValue(outcome.value) : null
  // The one raw cause text a screen shows: the browser's own error name.
  const errorName = browserErrorNameOf(outcome)
  const mayRetry = outcome.kind === 'dismissed' || outcome.retry
  const chromeOnly = binding === 'browser-authenticator' && !pagePasskeysServed()

  return (
    <View>
      {chip && (
        <Text weight="semiBold" style={spacings.mbSm}>
          {chip.set === 'method'
            ? renderChip('method', chip.chip, t)
            : renderChip('collection', chip.chip, t)}
        </Text>
      )}
      {chromeOnly ? (
        <Text style={spacings.mbSm}>{t('socialRecovery.ceremony.chromeOnly')}</Text>
      ) : (
        noteKey && <Text style={spacings.mbSm}>{t(noteKey, { hash })}</Text>
      )}
      {errorName && (
        <Text appearance="secondaryText" fontSize={12} style={spacings.mbSm}>
          {errorName}
        </Text>
      )}
      {lineKey && !chromeOnly && (
        <Text appearance="secondaryText" style={spacings.mbSm}>
          {t(lineKey)}
        </Text>
      )}
      {facts && (
        <>
          <Text weight="medium" style={spacings.mbSm}>
            {renderKindLine(facts, pagePlatform(), t)}
          </Text>
          <Text appearance="secondaryText" style={spacings.mbSm}>
            {t(lossLineKeyOf(facts))}
          </Text>
        </>
      )}
      {passedEnroll && binding === 'browser-authenticator' && (
        <Text appearance="secondaryText" style={spacings.mbSm}>
          {t('socialRecovery.ceremony.passkeyOrigin')}
        </Text>
      )}
      {reportHeld && (
        <Text appearance="secondaryText" style={spacings.mbSm}>
          {t('socialRecovery.ceremony.keepTabOpen')}
        </Text>
      )}
      {phase === 'undelivered' && (
        <>
          <Text style={spacings.mbSm}>{t('socialRecovery.ceremony.undeliveredNote')}</Text>
          <View style={[flexbox.directionRow, spacings.mtLg]}>
            <Button
              type="secondary"
              text={t('socialRecovery.ceremony.backAction')}
              onPress={onBack}
            />
            <Button
              type="primary"
              text={t('socialRecovery.ceremony.tryAgainAction')}
              onPress={onDeliverAgain}
              style={spacings.mlSm}
            />
          </View>
        </>
      )}
      {phase === 'done' && !returnTo && (
        <View style={[flexbox.directionRow, spacings.mtLg]}>
          <Button
            type="secondary"
            text={t('socialRecovery.ceremony.backAction')}
            onPress={onBack}
          />
          {mayRetry && (
            <Button
              type="primary"
              text={t('socialRecovery.ceremony.tryAgainAction')}
              onPress={onTryAgain}
              style={spacings.mlSm}
            />
          )}
        </View>
      )}
    </View>
  )
}

export default React.memo(OutcomeBlock)
