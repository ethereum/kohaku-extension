/**
 * An identity row's two ceremonies, the creation and the access test. Each
 * stores its request with the method's params on this chain before the tab
 * leaves for the ceremony, and the return path carries the request's id back
 * to the row. The ceremony tab is itself the hand-off: it shows the code the
 * phone scans, or asks for the image, so no route is chosen here.
 */
import { useCallback } from 'react'
import { isAddressEqual, zeroAddress } from 'viem'

import { ceremonyPath } from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonyRequestRecord } from '@web/modules/social-recovery/shared/records'

import { enrollRequestOf, testRequestRecordOf } from './identity'
import { enrollPathOf } from './search'
import { testRequestOf } from './testRequest'
import type { IdentityLaunch, IdentityLaunchInput } from './types'

const useIdentityLaunch = ({
  kind,
  records,
  navigate,
  search,
  account,
  chainId,
  book,
  client,
  deps,
  enrollment,
  setBusy,
  setWriteFailed
}: IdentityLaunchInput): IdentityLaunch => {
  const launch = useCallback(
    async (call: 'enroll' | 'testAccess', record: CeremonyRequestRecord) => {
      // The zero address is a deployment that omits the method: nothing runs and nothing is stored.
      if (isAddressEqual(book.methods[kind], zeroAddress)) {
        return
      }
      const id = deps.newRequestId()
      setBusy(true)
      try {
        await records.ceremonyRequest(id).write(record)
      } catch {
        setWriteFailed(true)
        setBusy(false)
        return
      }
      navigate(
        ceremonyPath({
          call,
          method: kind,
          id,
          handOff: false,
          returnTo: enrollPathOf(search, id)
        })
      )
    },
    [deps, records, book, kind, navigate, search, setBusy, setWriteFailed]
  )

  const create = useCallback(async () => {
    if (client.status !== 'ready') {
      return
    }
    const params = client.client.methodParamsFor(kind, 'enroll')
    if (!params) {
      return
    }
    await launch(
      'enroll',
      enrollRequestOf({
        kind,
        account,
        chainId,
        methodAddress: book.methods[kind],
        params,
        replaces: enrollment?.credential ?? null
      })
    )
  }, [client, kind, account, chainId, book, enrollment, launch])

  const runTest = useCallback(async () => {
    if (client.status !== 'ready' || !enrollment) {
      return
    }
    const params = client.client.methodParamsFor(kind, 'testAccess')
    if (!params) {
      return
    }
    const request = testRequestOf({
      descriptor: client.client.descriptor,
      chainId,
      account,
      method: book.methods[kind],
      config: enrollment.credential.config,
      now: deps.now(),
      randomBytes: deps.randomBytes
    })
    await launch('testAccess', testRequestRecordOf({ kind, account, chainId, request, params }))
  }, [client, enrollment, kind, chainId, account, book, deps, launch])

  return { create, runTest }
}

export default useIdentityLaunch
