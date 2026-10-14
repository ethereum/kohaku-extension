/**
 * The home surface's pointer to the recoveries this device started: one line
 * for each live session of the chain, and one for each submitted recovery
 * whose countdown runs. It renders nothing while the records load, where they
 * cannot be read, and where neither exists.
 */
import React, { useEffect, useState } from 'react'
import { View } from 'react-native'

import spacings from '@common/styles/spacings'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import WaitHomeLine from '@web/modules/social-recovery/recovery/wait/WaitHomeLine'

import HomeRecoveryLine from './HomeRecoveryLine'
import { inProgressItemsOf } from './inProgress'
import { inProgressPath, waitPathOf } from './search'
import type { HomeRecoveryBandViewProps, InProgressItem } from './types'

const HomeRecoveryBandView = ({
  records,
  chainId,
  navigate,
  timeZone,
  useHeadline
}: HomeRecoveryBandViewProps) => {
  const [items, setItems] = useState<InProgressItem[]>([])
  const [countdowns, setCountdowns] = useState<Address[]>([])

  useEffect(() => {
    let live = true
    Promise.all([
      records.listRecoverySessions(chainId),
      records.listRecoveryEntries(chainId),
      records.listCountdowns(chainId)
    ])
      .then(([sessions, entries, landed]) => {
        if (live) {
          setItems(inProgressItemsOf(sessions, entries))
          setCountdowns(landed.map(({ account }) => account))
        }
      })
      .catch(() => {
        if (live) {
          setItems([])
          setCountdowns([])
        }
      })
    return () => {
      live = false
    }
  }, [records, chainId])

  if (items.length === 0 && countdowns.length === 0) {
    return null
  }
  return (
    <View style={[spacings.phSm, spacings.mbSm]} testID="home-recovery-band">
      {items.map((item) => (
        <HomeRecoveryLine
          key={item.account}
          item={item}
          timeZone={timeZone}
          useHeadline={useHeadline}
          onOpen={() => navigate(inProgressPath())}
        />
      ))}
      {countdowns.map((account) => (
        <WaitHomeLine
          key={account}
          account={account}
          onOpen={() => navigate(waitPathOf(account))}
        />
      ))}
    </View>
  )
}

export default React.memo(HomeRecoveryBandView)
