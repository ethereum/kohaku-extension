/**
 * Where the setup's own editor leads inside the management editor: its
 * continue to the review of changes, its back to the overview, and an
 * enrollment it opens back to this editor, a return the enrollment keeps
 * across the ceremony's own trip away and back.
 */
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import {
  editorTargetOf,
  isPrivacyContinue
} from '@web/modules/social-recovery/management/editor/routing'
import { enrollPathOf, parseEnrollSearch } from '@web/modules/social-recovery/setup/enroll/search'

describe("the setup editor's routes inside the management editor", () => {
  it('opens the review of changes for the continue and the overview for the back', () => {
    expect(editorTargetOf(WEB_ROUTES.socialRecoverySetupWaitingPeriod)).toBe(
      WEB_ROUTES.socialRecoveryManageReview
    )
    expect(editorTargetOf(`/${WEB_ROUTES.socialRecoverySetup}`)).toBe(
      WEB_ROUTES.socialRecoveryManage
    )
  })

  it('sends an enrollment back to the management editor, across the ceremony', () => {
    const to = editorTargetOf(
      `${WEB_ROUTES.socialRecoverySetupEnroll}?kind=ecdsa&clause=0&member=2`
    )
    const search = parseEnrollSearch(to.slice(to.indexOf('?')))
    expect(search).toEqual({ kind: 'ecdsa', at: { clause: 0, member: 2 }, returnTo: 'manage' })
    const back = enrollPathOf(search!, 'ceremony-1')
    expect(parseEnrollSearch(back.slice(back.indexOf('?')))).toEqual({
      kind: 'ecdsa',
      at: { clause: 0, member: 2 },
      ceremony: 'ceremony-1',
      returnTo: 'manage'
    })
  })

  it('leaves an enrollment the setup opened without a return', () => {
    expect(parseEnrollSearch('?kind=passkey&clause=1&member=0')).toEqual({
      kind: 'passkey',
      at: { clause: 1, member: 0 }
    })
  })

  it("reads the privacy step's continue apart from its back", () => {
    expect(isPrivacyContinue(WEB_ROUTES.socialRecoverySetupReview)).toBe(true)
    expect(isPrivacyContinue(WEB_ROUTES.socialRecoverySetupWaitingPeriod)).toBe(false)
  })
})
