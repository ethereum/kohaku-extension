/**
 * The message a recoverer sends a guardian with the link: fixed copy that
 * names the install with its source and the publisher to check there, says
 * the link is not to be forwarded, asks for a call back on a number the
 * guardian already holds, and names the deadline and how the approval comes
 * back. Pure.
 */
import type { ApproverRequest } from '@web/modules/social-recovery/sdk-interfaces'
import type { Translate } from '@web/modules/social-recovery/shared/display'

const MESSAGE = 'socialRecovery.checklist.message'

/** The message's paragraphs, joined by blank lines; `renderDate` renders a moment in ms. */
export const messageOf = (
  request: ApproverRequest,
  link: string,
  t: Translate,
  renderDate: (at: number) => string
): string =>
  [
    t(`${MESSAGE}.intro`),
    t(`${MESSAGE}.install`, {
      source: t(`${MESSAGE}.sourceName`),
      publisher: t(`${MESSAGE}.publisherName`)
    }),
    t(`${MESSAGE}.openLink`, { link }),
    t(`${MESSAGE}.doNotForward`),
    t(`${MESSAGE}.callBack`),
    t(`${MESSAGE}.callReceived`),
    t(`${MESSAGE}.approveOnPage`),
    t(`${MESSAGE}.deadline`, { deadline: renderDate(Number(request.validUntil) * 1000) }),
    t(`${MESSAGE}.submittable`),
    t(`${MESSAGE}.reply`)
  ].join('\n\n')
