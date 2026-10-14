/**
 * The approval page's link: one place's request in one search parameter of
 * the approve route, read back to the same request. It names the setup by the
 * hash of its body and never carries the body; a link that was cut, edited or
 * stripped of a field reads as no request at all.
 */
import { keccak256 } from 'viem'

import { WEB_ROUTES } from '@common/modules/router/constants/common'
import type { ApproverRequest } from '@web/modules/social-recovery/sdk-interfaces'
import {
  approvalLinkOf,
  requestOfApprovalLink
} from '@web/modules/social-recovery/recovery/checklist'

const TAB = 'chrome-extension://kohaku/tab.html'

const GATHERING_BODY = '0x0102030405060708090a0b0c0d0e0f'

const REQUEST: ApproverRequest = {
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: '11155111',
  manager: '0x9000000000000000000000000000000000000001',
  digestVersion: '1',
  account: '0x1111111111111111111111111111111111111111',
  action: '0x9000000000000000000000000000000000000002',
  attemptId: '3',
  setupNonce: '2',
  setupBodyHash: keccak256(GATHERING_BODY),
  payload: '0xabcdef',
  order: {
    token: '0x0000000000000000000000000000000000000000',
    amount: '0',
    payee: '0x0000000000000000000000000000000000000000'
  },
  validUntil: '1800086400',
  place: 1,
  method: '0x9000000000000000000000000000000000000003',
  config: '0x0000000000000000000000007000000000000000000000000000000000000001',
  salt: '0x00000000000000000000000000000000000000000000000000000000000003e9'
}

/** The text of the link's one search parameter, as the guardian's browser reads it. */
const carriedOf = (link: string): string =>
  new URLSearchParams(link.slice(link.indexOf('?') + 1)).get('request') ?? ''

const jsonOf = (line: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(line, 'base64url').toString('utf8'))

const linkCarrying = (value: unknown): string =>
  `${TAB}#/${WEB_ROUTES.socialRecoveryApprove}?request=${Buffer.from(
    JSON.stringify(value)
  ).toString('base64url')}`

describe('the approval page link', () => {
  it('reads back to the request it was built from', () => {
    const link = approvalLinkOf(REQUEST, TAB)

    expect(requestOfApprovalLink(link)).toEqual(REQUEST)
  })

  it('reads back from the route search string alone, as the page receives it', () => {
    const link = approvalLinkOf(REQUEST, TAB)

    expect(requestOfApprovalLink(link.slice(link.indexOf('?')))).toEqual(REQUEST)
  })

  it('reads back a cancellation request that carries no order and no handover bytes', () => {
    const bare: ApproverRequest = { ...REQUEST, purpose: 'cancellation' }
    delete bare.order
    delete bare.payload

    expect(requestOfApprovalLink(approvalLinkOf(bare, TAB))).toEqual(bare)
  })

  it('opens the extension page at the approve route', () => {
    const link = approvalLinkOf(REQUEST, TAB)

    expect(link.startsWith(`${TAB}#/${WEB_ROUTES.socialRecoveryApprove}?`)).toBe(true)
    expect(link).not.toMatch(/\s/)
  })

  it('carries the hash of the setup body and never the body', () => {
    const carried = jsonOf(carriedOf(approvalLinkOf(REQUEST, TAB)))

    expect(carried.setupBodyHash).toBe(keccak256(GATHERING_BODY))
    expect(carried).not.toHaveProperty('setupBody')
    expect(JSON.stringify(carried)).not.toContain(GATHERING_BODY.slice(2))
  })

  it('carries the parameter as base64url with no padding', () => {
    expect(carriedOf(approvalLinkOf(REQUEST, TAB))).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  const mangled: [string, string][] = [
    ['a link with no request parameter', `${TAB}#/${WEB_ROUTES.socialRecoveryApprove}`],
    ['an empty request parameter', `${TAB}#/${WEB_ROUTES.socialRecoveryApprove}?request=`],
    [
      'a request cut short',
      (() => {
        const link = approvalLinkOf(REQUEST, TAB)
        return link.slice(0, link.length - 12)
      })()
    ],
    [
      'a request with a character no base64url holds',
      (() => {
        const link = approvalLinkOf(REQUEST, TAB)
        const at = link.indexOf('request=') + 'request='.length + 10
        return `${link.slice(0, at)}*${link.slice(at + 1)}`
      })()
    ],
    [
      'a request that is not JSON',
      `${TAB}#/x?request=${Buffer.from('nope').toString('base64url')}`
    ],
    ['a request that is a JSON array', linkCarrying([REQUEST])],
    [
      'a request with no setup hash',
      linkCarrying(
        Object.fromEntries(Object.entries(REQUEST).filter(([k]) => k !== 'setupBodyHash'))
      )
    ],
    ['a request of another kind', linkCarrying({ ...REQUEST, kind: 'recovery-proof-reply' })],
    ['a request whose account is no address', linkCarrying({ ...REQUEST, account: '0x1234' })],
    ['a request whose place is text', linkCarrying({ ...REQUEST, place: '1' })],
    ['a request whose attempt is a number', linkCarrying({ ...REQUEST, attemptId: 3 })],
    ['a request whose deadline is not a decimal', linkCarrying({ ...REQUEST, validUntil: 'soon' })],
    [
      'a request whose order has no payee',
      linkCarrying({ ...REQUEST, order: { token: REQUEST.order?.token, amount: '0' } })
    ],
    ['a request whose handover bytes are not hex', linkCarrying({ ...REQUEST, payload: 'abc' })]
  ]

  mangled.forEach(([name, link]) =>
    it(`reads ${name} as no request`, () => {
      expect(requestOfApprovalLink(link)).toBeNull()
    })
  )

  it('reads an approval request with no handover bytes as no request', () => {
    const { payload, ...withoutPayload } = REQUEST

    expect(payload).toBeDefined()
    expect(requestOfApprovalLink(linkCarrying(withoutPayload))).toBeNull()
  })

  it('reads back an approval request with no order as one with no payment', () => {
    const { order, ...withoutOrder } = REQUEST

    expect(order).toBeDefined()
    const read = requestOfApprovalLink(approvalLinkOf(withoutOrder, TAB))
    expect(read).toEqual(withoutOrder)
    expect(read).not.toHaveProperty('order')
  })

  it('reads a cancellation request with neither from a link built elsewhere', () => {
    const { payload, order, ...bare } = REQUEST
    const cancellation = { ...bare, purpose: 'cancellation' }

    expect([payload, order]).not.toContain(undefined)
    expect(requestOfApprovalLink(linkCarrying(cancellation))).toEqual(cancellation)
  })

  it('reads a request of exactly 16 KiB, and the next longer one as no request', () => {
    const base = JSON.stringify({ ...REQUEST, filler: '' }).length
    const atLength = (length: number): string => {
      let filler = 'x'.repeat(Math.floor((length * 3) / 4) - base - 4)
      let line = ''
      do {
        filler += 'x'
        line = Buffer.from(JSON.stringify({ ...REQUEST, filler })).toString('base64url')
      } while (line.length < length)
      return line
    }
    const linkOf = (line: string) => `${TAB}#/${WEB_ROUTES.socialRecoveryApprove}?request=${line}`
    const longest = atLength(16 * 1024)
    const tooLong = atLength(16 * 1024 + 1)

    expect(longest).toHaveLength(16 * 1024)
    expect(tooLong.length).toBeGreaterThan(16 * 1024)
    expect(requestOfApprovalLink(linkOf(longest))).toEqual(REQUEST)
    expect(requestOfApprovalLink(linkOf(tooLong))).toBeNull()
  })

  it('reads a line of a megabyte as no request, and never throws', () => {
    const huge = Buffer.from(
      JSON.stringify({ ...REQUEST, filler: 'x'.repeat(1024 * 1024) })
    ).toString('base64url')
    const garbage = '*'.repeat(1024 * 1024)

    expect(() => requestOfApprovalLink(`?request=${huge}`)).not.toThrow()
    expect(requestOfApprovalLink(`?request=${huge}`)).toBeNull()
    expect(() => requestOfApprovalLink(`?request=${garbage}`)).not.toThrow()
    expect(requestOfApprovalLink(`?request=${garbage}`)).toBeNull()
  })

  it('drops a setup body a link from elsewhere adds, so the page never reads one', () => {
    const decoded = requestOfApprovalLink(linkCarrying({ ...REQUEST, setupBody: GATHERING_BODY }))

    expect(decoded).toEqual(REQUEST)
    expect(decoded).not.toHaveProperty('setupBody')
  })
})
