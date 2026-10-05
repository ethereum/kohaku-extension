/**
 * The wallet's own reads, under the name screens use.
 *
 * Three reads the screens need are not SDK members: the verify per pasted
 * reply, the key a recovery would remove, and the fit check against the code
 * the account will carry. The doubles script them as `IWalletReadsDouble`;
 * this folder hands them to screens as `WalletReads` (types.ts), so no screen
 * imports the doubles' name and the real implementation replaces the double
 * here alone. Each read throws when it could not be made and never answers
 * empty.
 */
export { REMOVED_KEY_UNAVAILABLE_CAUSES } from '@web/modules/social-recovery/sdk-doubles'
