import React from 'react'

import Badge from '@common/components/Badge'

import type { StatusChipProps } from './types'

// No tooltip, so the chip's text stays the only text under its testID.
const StatusChip = ({ text, tone = 'default', style, testID }: StatusChipProps) => (
  <Badge text={text} type={tone} style={style} testId={testID} />
)

export default React.memo(StatusChip)
