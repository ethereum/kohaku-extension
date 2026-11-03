/**
 * The card of the committed setup's path. A setup the account authorizes
 * carries edit the path and remove recovery, with the overview's line while
 * an attempt is open; both are held while the path or the notices since the
 * commit are read.
 */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'

import { OVERVIEW } from './constants'
import PathActions from './PathActions'
import PathBody from './PathBody'
import type { PathBlockProps } from './types'

const PathBlock = ({
  reads,
  context,
  networkName,
  kind,
  attemptOpen,
  navigate
}: PathBlockProps) => {
  const { t } = useTranslation()
  return (
    <SectionCard testID="overview-path">
      <PathBody reads={reads} context={context} networkName={networkName} />
      {kind === 'set-up' && (
        <>
          {attemptOpen && (
            <Text
              fontSize={14}
              weight="medium"
              style={spacings.mtSm}
              testID="overview-path-pending"
            >
              {t(`${OVERVIEW}.path.pendingLine`)}
            </Text>
          )}
          <PathActions
            disabled={reads.path.kind === 'reading' || reads.notices.status === 'pending'}
            navigate={navigate}
          />
        </>
      )}
    </SectionCard>
  )
}

export default React.memo(PathBlock)
