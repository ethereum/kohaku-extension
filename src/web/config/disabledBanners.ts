import { Banner } from '@ambire-common/interfaces/banner'

/**
 * List of banner IDs that should be disabled/hidden from the UI for the current iteration
 */
export const DISABLED_BANNER_IDS: Array<string | number> = [
  'keystore-secret-backup' // "Enable extension password reset via email" banner
]

export const filterDisabledBanners = (banners: Banner[]): Banner[] => {
  return banners.filter((banner) => !DISABLED_BANNER_IDS.includes(banner.id))
}
