import { Mnemonic } from 'ethers'

/**
 * Validates a seed phrase (mnemonic)
 * @param seedPhrase - The seed phrase to validate
 * @returns An object with isValid flag and optional error message
 */
export const validateSeedPhrase = (seedPhrase: string): { isValid: boolean; error?: string } => {
  if (!seedPhrase || seedPhrase.trim().length === 0) {
    return { isValid: false }
  }

  const formattedSeedPhrase = seedPhrase.trim().toLowerCase().replace(/\s+/g, ' ')

  // Check if it's a valid BIP39 mnemonic phrase
  try {
    if (!Mnemonic.isValidMnemonic(formattedSeedPhrase)) {
      return {
        isValid: false,
        error: 'Invalid recovery phrase. Please check and try again.'
      }
    }

    return { isValid: true }
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid recovery phrase format.'
    }
  }
}
