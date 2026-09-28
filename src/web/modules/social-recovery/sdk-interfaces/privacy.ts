/**
 * The privacy levels the setup screen offers. These are the extension's and the
 * SDK's encoding over the two metadata fields of the setup event; the contract
 * defines no levels and reads neither field. Whether two or three levels ship
 * is still open; this file declares all three.
 *
 * - private, the default: shape and values encrypted into the private field,
 *   nothing readable in the public one.
 * - shape-visible: the shape in the clear in the public field, the values
 *   encrypted in the private one.
 * - public: everything in the clear and no recovery password.
 */
export const PRIVACY_LEVELS = ['private', 'shape-visible', 'public'] as const
// `private` is the default level. The default is a screen's value to set, so
// this file declares no runtime constant for it.
export type PrivacyLevel = typeof PRIVACY_LEVELS[number]
