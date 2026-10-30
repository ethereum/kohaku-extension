/**
 * Where the setup's own steps lead when the management editor hosts them.
 * The editor's continue, which follows its path check, opens the review of
 * changes; its back returns to the overview; an enrollment it opens carries
 * the return to this editor. The waiting period and the privacy steps return
 * to the path wherever they would lead.
 */
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { ENROLL_SEARCH_KEYS, MANAGE_RETURN } from '@web/modules/social-recovery/setup/enroll/search'

const bare = (to: string): string => to.replace(/^\//, '')

/** An enrollment's path with the return to the management editor. */
export const withManageReturn = (to: string): string =>
  `${to}${to.includes('?') ? '&' : '?'}${ENROLL_SEARCH_KEYS.returnTo}=${MANAGE_RETURN}`

/** The route the management editor opens for a route the setup's editor asks for. */
export const editorTargetOf = (to: string): string => {
  const route = bare(to)
  if (route === WEB_ROUTES.socialRecoverySetupWaitingPeriod) {
    return WEB_ROUTES.socialRecoveryManageReview
  }
  if (route === WEB_ROUTES.socialRecoverySetup) {
    return WEB_ROUTES.socialRecoveryManage
  }
  if (route.startsWith(WEB_ROUTES.socialRecoverySetupEnroll)) {
    return withManageReturn(to)
  }
  return to
}

/** Whether a step's route is the privacy step's continue, which stored a level and a password. */
export const isPrivacyContinue = (to: string): boolean =>
  bare(to) === WEB_ROUTES.socialRecoverySetupReview
