import { english, generateMnemonic } from 'viem/accounts'

export const generateSeedPhrase = () => {
  return generateMnemonic(english)
}
