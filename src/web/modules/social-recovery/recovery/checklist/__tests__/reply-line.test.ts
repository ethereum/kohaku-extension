/**
 * The approval a guardian sends back travels as its record in plain JSON on
 * one line, keys in the record's order; the paste reads any JSON whitespace
 * and refuses the earlier base64url form.
 */
import type { Reply } from '@kohaku-eth/social-recovery'
import { replyLineOf, replyOfLine } from '@web/modules/social-recovery/recovery/checklist/paste'

const REPLY: Reply = {
  kind: 'recovery-proof-reply',
  version: 1,
  chainId: '11155111',
  manager: '0x1111111111111111111111111111111111111111',
  account: '0x2222222222222222222222222222222222222222',
  action: '0x3333333333333333333333333333333333333333',
  attemptId: '18446744073709551617',
  purpose: 'approval',
  place: 2,
  method: '0x4444444444444444444444444444444444444444',
  config: '0xabcd',
  salt: '0x',
  digest: `0x${'5'.repeat(64)}`,
  proof: `0x${'6'.repeat(130)}`
}

const EXPECTED_LINE =
  '{"kind":"recovery-proof-reply","version":1,"chainId":"11155111",' +
  '"manager":"0x1111111111111111111111111111111111111111",' +
  '"account":"0x2222222222222222222222222222222222222222",' +
  '"action":"0x3333333333333333333333333333333333333333",' +
  '"attemptId":"18446744073709551617","purpose":"approval","place":2,' +
  '"method":"0x4444444444444444444444444444444444444444","config":"0xabcd","salt":"0x",' +
  `"digest":"0x${'5'.repeat(64)}","proof":"0x${'6'.repeat(130)}"}`

describe('the approval line', () => {
  it('is the record as plain JSON on one line, keys in the record’s order', () => {
    expect(replyLineOf(REPLY)).toBe(EXPECTED_LINE)
  })

  it('keeps the record’s order whatever order the reply object was built in', () => {
    const shuffled = Object.fromEntries(Object.entries(REPLY).reverse()) as Reply
    expect(replyLineOf(shuffled)).toBe(EXPECTED_LINE)
  })

  it('carries only the record’s fields', () => {
    const extended = { ...REPLY, note: 'hello' } as Reply
    expect(replyLineOf(extended)).toBe(EXPECTED_LINE)
  })

  it('round-trips through the paste', () => {
    expect(replyOfLine(replyLineOf(REPLY))).toEqual(REPLY)
  })

  it('reads a pasted line with JSON whitespace inside and around it', () => {
    expect(replyOfLine(`\n  ${JSON.stringify(REPLY, null, 2)}\t\n`)).toEqual(REPLY)
    expect(replyOfLine(EXPECTED_LINE.replace(/,"/g, ', "').replace(/":/g, '": '))).toEqual(REPLY)
  })

  it('refuses the earlier base64url form of the same record', () => {
    const earlier = Buffer.from(JSON.stringify(REPLY)).toString('base64url')
    expect(replyOfLine(earlier)).toBeNull()
  })

  it('refuses a line that is not JSON or not a reply', () => {
    expect(replyOfLine('')).toBeNull()
    expect(replyOfLine('{"kind":')).toBeNull()
    expect(replyOfLine('123')).toBeNull()
    expect(replyOfLine(JSON.stringify([REPLY]))).toBeNull()
    expect(replyOfLine(JSON.stringify({ ...REPLY, chainId: 11155111 }))).toBeNull()
  })
})
