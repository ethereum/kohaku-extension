/**
 * The request ids of the management screens' writes: each names its write,
 * so a page that finds one stored knows whose it is.
 */
import { newSendRequestId } from '@web/modules/social-recovery/shared/client'
import {
  intentOfRequest,
  overviewIntentOf,
  requestIdOf
} from '@web/modules/social-recovery/shared/writes'

describe('the overview write a stored request id names', () => {
  it('finds the write a stored request id names, and none for another screen request', () => {
    expect(intentOfRequest(requestIdOf('reauthorize'))).toBe('reauthorize')
    expect(intentOfRequest(requestIdOf('clear'))).toBe('clear')
    expect(intentOfRequest(requestIdOf('removeAuthorization'))).toBe('removeAuthorization')
    expect(requestIdOf('clear')).not.toBe(requestIdOf('clear'))
    expect(intentOfRequest('social-recovery-sender:1234')).toBeUndefined()
  })

  it("reads the editor's edit and removal by their marks, and neither as an overview write", () => {
    const edit = `${newSendRequestId()}:manage-edit`
    const remove = `${newSendRequestId()}:manage-remove`
    expect(intentOfRequest(edit)).toBe('manageEdit')
    expect(intentOfRequest(remove)).toBe('manageRemove')
    expect(overviewIntentOf(edit)).toBeUndefined()
    expect(overviewIntentOf(remove)).toBeUndefined()
    expect(overviewIntentOf(requestIdOf('clear'))).toBe('clear')
  })
})
