// Stands in for @expo-google-fonts/*: the packages ship ESM and require .ttf files, which Jest cannot load.
/* eslint-disable @typescript-eslint/naming-convention -- the names are the packages' own exports */
export const Poppins_300Light = 'Poppins_300Light'
export const Poppins_400Regular = 'Poppins_400Regular'
export const Poppins_500Medium = 'Poppins_500Medium'
export const Poppins_600SemiBold = 'Poppins_600SemiBold'
export const Roboto_300Light = 'Roboto_300Light'
export const Roboto_400Regular = 'Roboto_400Regular'
export const Roboto_500Medium = 'Roboto_500Medium'
export const Roboto_700Bold = 'Roboto_700Bold'
export const Roboto_900Black = 'Roboto_900Black'
export const useFonts = (): [boolean, null] => [true, null]
