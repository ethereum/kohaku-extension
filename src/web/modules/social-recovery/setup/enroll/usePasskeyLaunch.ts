/**
 * The passkey row's two ceremonies, the creation and the access test. Each
 * stores its request before the tab leaves for the ceremony, and the return
 * path carries the request's id back to the row.
 */
import { useCallback } from 'react'

import { ceremonyPath } from '@web/modules/social-recovery/shared/ceremony'

import { clipName, enrollRequestOf, PASSKEY_SLUG, testRequestRecordOf } from './passkey'
import { enrollPathOf } from './search'
import { testRequestOf } from './testRequest'
import type { PasskeyLaunch, PasskeyLaunchInput } from './types'

const usePasskeyLaunch = ({
  records,
  navigate,
  search,
  account,
  chainId,
  book,
  client,
  deps,
  enrollment,
  name,
  defaultName,
  createdOnPhone,
  setBusy,
  setWriteFailed
}: PasskeyLaunchInput): PasskeyLaunch => {
  const create = useCallback(
    async (handOff: boolean, asName?: string) => {
      const userName = asName ?? (clipName(name.trim()) || defaultName)
      const id = deps.newRequestId()
      setBusy(true)
      try {
        await records.ceremonyRequest(id).write(
          enrollRequestOf({
            account,
            chainId,
            methodAddress: book.methods.passkey,
            userName,
            handOff
          })
        )
      } catch {
        setWriteFailed(true)
        setBusy(false)
        return
      }
      navigate(
        ceremonyPath({
          call: 'enroll',
          method: PASSKEY_SLUG,
          id,
          handOff,
          returnTo: enrollPathOf(search, id)
        })
      )
    },
    [
      name,
      defaultName,
      deps,
      records,
      account,
      chainId,
      book,
      navigate,
      search,
      setBusy,
      setWriteFailed
    ]
  )

  const runTest = useCallback(async () => {
    if (client.status !== 'ready' || !enrollment) {
      return
    }
    const request = testRequestOf({
      descriptor: client.client.descriptor,
      chainId,
      account,
      method: book.methods.passkey,
      config: enrollment.credential.config,
      now: deps.now(),
      randomBytes: deps.randomBytes
    })
    const id = deps.newRequestId()
    setBusy(true)
    try {
      await records.ceremonyRequest(id).write(
        testRequestRecordOf({
          account,
          chainId,
          request,
          credentialId: enrollment.credentialId,
          facts: enrollment.facts,
          handOff: createdOnPhone
        })
      )
    } catch {
      setWriteFailed(true)
      setBusy(false)
      return
    }
    navigate(
      ceremonyPath({
        call: 'testAccess',
        method: PASSKEY_SLUG,
        id,
        handOff: false,
        returnTo: enrollPathOf(search, id)
      })
    )
  }, [
    client,
    enrollment,
    chainId,
    account,
    book,
    deps,
    records,
    createdOnPhone,
    navigate,
    search,
    setBusy,
    setWriteFailed
  ])

  return { create, runTest }
}

export default usePasskeyLaunch
