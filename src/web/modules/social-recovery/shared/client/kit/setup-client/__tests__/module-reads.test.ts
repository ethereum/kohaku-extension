/**
 * The module reads a setup and the review's trust list make. A view that
 * reverts answered, with the empty value; a read the provider could not make,
 * or an address with no code, did not answer.
 */
import { zeroAddress } from 'viem'

import { createMethodReads } from '@web/modules/social-recovery/shared/client/kit/reads'
import { moduleReadsOf } from '@web/modules/social-recovery/shared/client/kit/setup-client'
import { providerReadFailure } from '@web/modules/social-recovery/shared/client/provider-adapter'

import {
  fakeNode,
  METHOD_CALLS,
  METHOD_ECDSA,
  reverting,
  scriptMethod,
  word
} from '@web/modules/social-recovery/shared/client/kit/setup-client/__tests__/harness'

const readsOver = () => {
  const node = fakeNode()
  return { node, reads: moduleReadsOf(createMethodReads(node.provider)) }
}

const NO_PARTIES = {
  admin: zeroAddress,
  pendingAdmin: zeroAddress,
  trustedKeys: [],
  pauseHolder: zeroAddress,
  pendingPauseHolder: zeroAddress
}

describe('the module reads', () => {
  it("answers a deployed method's declaration, its parties and its stop", async () => {
    const { node, reads } = readsOver()
    scriptMethod(node, METHOD_ECDSA, { name: 'method-ecdsa', version: '1.0.0', paused: word(1n) })
    await expect(reads.moduleInfo(METHOD_ECDSA)).resolves.toEqual({
      answered: true,
      value: { name: 'method-ecdsa', version: '1.0.0', supportsInterface: true }
    })
    await expect(reads.trustedParties(METHOD_ECDSA)).resolves.toEqual({
      answered: true,
      value: NO_PARTIES
    })
    await expect(reads.paused(METHOD_ECDSA)).resolves.toEqual({ answered: true, value: true })
  })

  it('answers the empty values for a method whose views revert', async () => {
    const { node, reads } = readsOver()
    scriptMethod(node, METHOD_ECDSA, { views: reverting('0xdeadbeef') })
    await expect(reads.moduleInfo(METHOD_ECDSA)).resolves.toEqual({
      answered: true,
      value: { name: '', version: '', supportsInterface: false }
    })
    await expect(reads.trustedParties(METHOD_ECDSA)).resolves.toEqual({
      answered: true,
      value: NO_PARTIES
    })
  })

  it('answers false for a stop read that reverts', async () => {
    const { node, reads } = readsOver()
    scriptMethod(node, METHOD_ECDSA, { paused: reverting() })
    await expect(reads.paused(METHOD_ECDSA)).resolves.toEqual({ answered: true, value: false })
  })

  it('answers nothing where the provider could not make the read', async () => {
    const { node, reads } = readsOver()
    const failure = providerReadFailure('call', new Error('down'))
    scriptMethod(node, METHOD_ECDSA, { views: failure, paused: failure })
    await expect(reads.moduleInfo(METHOD_ECDSA)).resolves.toEqual({ answered: false })
    await expect(reads.trustedParties(METHOD_ECDSA)).resolves.toEqual({ answered: false })
    await expect(reads.paused(METHOD_ECDSA)).resolves.toEqual({ answered: false })
  })
  ;(['name', 'version', 'supportsInterface'] as const).forEach((read) =>
    it(`answers nothing where the ${read} read alone could not be made`, async () => {
      const { node, reads } = readsOver()
      scriptMethod(node, METHOD_ECDSA)
      node.answer(METHOD_ECDSA, METHOD_CALLS[read], providerReadFailure('call', new Error('down')))
      await expect(reads.moduleInfo(METHOD_ECDSA)).resolves.toEqual({ answered: false })
    })
  )

  it('answers nothing for the declaration and the parties of an address with no code', async () => {
    const { reads } = readsOver()
    await expect(reads.moduleInfo(METHOD_ECDSA)).resolves.toEqual({ answered: false })
    await expect(reads.trustedParties(METHOD_ECDSA)).resolves.toEqual({ answered: false })
  })
})
