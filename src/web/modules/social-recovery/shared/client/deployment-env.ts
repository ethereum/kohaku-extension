/**
 * The one place the build-time deployment variable is read. The build inlines
 * `process.env.SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT` from the developer's `.env`
 * at compile time, so the member access stays written out in full.
 */

/** The variable's name, for the messages that refuse its value. */
export const SEPOLIA_DEPLOYMENT_VARIABLE = 'SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT'

/**
 * The raw value of the Sepolia deployment variable, or undefined where the
 * build sets none. An empty or blank value counts as none.
 */
export const sepoliaDeploymentVariable = (): string | undefined => {
  const raw = process.env.SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT
  if (raw === undefined || raw.trim() === '') {
    return undefined
  }
  return raw
}
