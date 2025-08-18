import React from 'react'

import LockIcon from '@legends/common/assets/svg/LockIcon'
import useLegendsContext from '@legends/hooks/useLegendsContext'
import { CardStatus } from '@legends/modules/legends/types'

import styles from './OverachieverBanner.module.scss'

const OverachieverBanner: React.FC<{ wrapperClassName?: string }> = ({ wrapperClassName }) => {
  const { legends } = useLegendsContext()

  const isOverachieverReached = legends.some(
    (card) => card.id === 'overachiever' && card.card.status === CardStatus.completed
  )

  const hasPenalty = legends.some((card) => card.id === 'staking' && card.meta?.hasPenalty)

  if (!isOverachieverReached && !hasPenalty) return null

  return (
    <div className={`${styles.overachieverBanner} ${wrapperClassName}`}>
      <LockIcon className={styles.lockIcon} width={29} height={37} />
      <p className={styles.overachieverText}>
        {hasPenalty
          ? 'Quests are not available while you have a pending unstake request'
          : 'Daily limit of 20 transactions reached. Every other transaction for the rest of the day earns you 1XP.'}
      </p>
    </div>
  )
}

export default OverachieverBanner
