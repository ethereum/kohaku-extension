/**
 * The account field: an address or a name, on the one network the wallet
 * reads. What is not a complete address or a name is refused before any read;
 * a name resolves through the wallet's own resolver, and one that does not
 * exist or resolves to no address is refused with a retry, apart from a read
 * that failed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { isAddress } from 'viem'

import Button from '@common/components/Button'
import Input from '@common/components/Input'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { ActionsRow, PageTitle, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'

import { lookupInputOf, nameLookupFailureOf } from './lookup'
import type { FieldError, LookupFieldProps } from './types'

const ACCOUNT = 'socialRecovery.entry.account'

const LookupField = ({
  networkName,
  onTarget,
  resolveName,
  onBack,
  onCancel
}: LookupFieldProps) => {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const [error, setError] = useState<FieldError | null>(null)
  const [resolving, setResolving] = useState(false)
  const live = useRef(true)

  useEffect(
    () => () => {
      live.current = false
    },
    []
  )

  const edit = useCallback((typed: string) => {
    setValue(typed)
    setError(null)
  }, [])

  const lookUp = useCallback(() => {
    const input = lookupInputOf(value)
    if (input.kind === 'empty') {
      return
    }
    if (input.kind === 'malformed') {
      setError('malformed')
      return
    }
    if (input.kind === 'address') {
      onTarget({ address: input.address })
      return
    }
    setError(null)
    setResolving(true)
    Promise.resolve()
      .then(() => resolveName(input.name))
      .then(
        (resolved) => {
          if (!live.current) {
            return
          }
          setResolving(false)
          if (isAddress(resolved)) {
            onTarget({ address: resolved, name: input.name })
          } else {
            setError('name')
          }
        },
        (failure: unknown) => {
          if (live.current) {
            setResolving(false)
            setError(nameLookupFailureOf(failure))
          }
        }
      )
  }, [value, onTarget, resolveName])

  return (
    <View testID="entry-account-field">
      <PageTitle
        title={t(`${ACCOUNT}.title`)}
        lead={t(`${ACCOUNT}.lead`)}
        titleTestID="entry-account-title"
      />
      <Text fontSize={14} weight="medium" style={spacings.mbTy}>
        {t(`${ACCOUNT}.fieldLabel`)}
      </Text>
      <Input
        testID="entry-account-input"
        value={value}
        onChangeText={edit}
        onSubmitEditing={lookUp}
        disabled={resolving}
        autoCapitalize="none"
        autoCorrect={false}
        containerStyle={spacings.mbTy}
      />
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID="entry-network">
        {t(`${ACCOUNT}.networkFixed`, { network: networkName })}
      </Text>
      <Text fontSize={12} appearance="secondaryText" style={spacings.mbSm}>
        {t(`${ACCOUNT}.hint`)}
      </Text>

      {error === 'malformed' && (
        <View testID="entry-account-malformed" style={spacings.mbSm}>
          <Text fontSize={14} appearance="errorText" weight="medium">
            {t(`${ACCOUNT}.errors.malformedTitle`)}
          </Text>
          <Text fontSize={12} appearance="errorText">
            {t(`${ACCOUNT}.errors.malformedHint`)}
          </Text>
        </View>
      )}
      {error === 'name' && (
        <ReadFailedBlock
          testID="entry-account-name-error"
          title={t(`${ACCOUNT}.errors.nameTitle`)}
          body={t(`${ACCOUNT}.errors.nameHint`)}
          onRetry={lookUp}
        />
      )}
      {error === 'read-failed' && (
        <ReadFailedBlock
          testID="entry-account-name-read-failed"
          title={t(`${ACCOUNT}.errors.readFailedTitle`, { network: networkName })}
          body={t(`${ACCOUNT}.errors.readFailedHint`)}
          onRetry={lookUp}
        />
      )}

      <ActionsRow
        primary={
          <Button
            testID="entry-account-look-up"
            type="primary"
            text={resolving ? t(`${ACCOUNT}.lookingUpShort`) : t(`${ACCOUNT}.action`)}
            disabled={resolving || lookupInputOf(value).kind === 'empty'}
            onPress={lookUp}
            hasBottomSpacing={false}
          />
        }
        secondary={
          <>
            {!!onBack && (
              <Button
                testID="entry-account-back"
                type="outline"
                text={t('socialRecovery.actions.back')}
                onPress={onBack}
                hasBottomSpacing={false}
                style={spacings.mrSm}
              />
            )}
            <Button
              testID="entry-account-cancel"
              type="ghost"
              text={t('socialRecovery.actions.cancel')}
              onPress={onCancel}
              hasBottomSpacing={false}
            />
            {resolving && (
              <ActivityIndicator testID="entry-account-resolving" style={spacings.mlSm} />
            )}
          </>
        }
      />

      <SectionCard tone="muted" spacing="item" style={spacings.mtLg} testID="entry-account-where">
        <Text fontSize={14} weight="medium" style={spacings.mbTy}>
          {t(`${ACCOUNT}.whereTitle`)}
        </Text>
        <Text fontSize={12} appearance="secondaryText">
          {t(`${ACCOUNT}.whereBody`)}
        </Text>
      </SectionCard>
      <SectionCard tone="muted" spacing="item" testID="entry-account-starts-nothing">
        <Text fontSize={14} weight="medium" style={spacings.mbTy}>
          {t(`${ACCOUNT}.startsNothingTitle`)}
        </Text>
        <Text fontSize={12} appearance="secondaryText">
          {t(`${ACCOUNT}.startsNothingBody`)}
        </Text>
      </SectionCard>
    </View>
  )
}

export default React.memo(LookupField)
