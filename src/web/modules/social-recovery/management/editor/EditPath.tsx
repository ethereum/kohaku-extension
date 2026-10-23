/**
 * The edit's path: the setup's own editor over the setup records, with the
 * committed values above its review action, and the cancel of the edit.
 * While the path is checked, the values' changes hold, as the editor's own
 * edits do; the cancel stays, as the editor's own back does.
 */
import React, { useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import { useTranslation } from '@common/config/localization'
import { ActionsRow } from '@web/modules/social-recovery/shared/chrome'
import EditorView from '@web/modules/social-recovery/setup/editor/EditorView'

import { makesCardStale } from './changes'
import { EDITOR } from './constants'
import type { EditPathProps } from './types'
import ValuesBlock from './ValuesBlock'

const EditPath = ({
  records,
  client,
  addressBook,
  navigate,
  stillNeeded,
  heading,
  draft,
  rows,
  onStage,
  onCancel
}: EditPathProps) => {
  const { t } = useTranslation()
  const [checking, setChecking] = useState(false)
  return (
    <View testID="manage-edit-path">
      <EditorView
        records={records}
        client={client}
        addressBook={addressBook}
        navigate={navigate}
        stillNeeded={stillNeeded}
        plainRemoval
        heading={heading}
        continueLabel={t(`${EDITOR}.review`)}
        onCheckingChange={setChecking}
        beforeActions={
          <ValuesBlock
            draft={draft}
            addressBook={addressBook}
            passwordChanged={rows.some(({ kind }) => kind === 'password')}
            stale={makesCardStale(rows)}
            disabled={checking}
            onStage={onStage}
          />
        }
      />
      <ActionsRow
        primary={
          <Button
            testID="manage-edit-cancel"
            type="outline"
            text={t('socialRecovery.actions.cancel')}
            onPress={onCancel}
            hasBottomSpacing={false}
          />
        }
      />
    </View>
  )
}

export default React.memo(EditPath)
