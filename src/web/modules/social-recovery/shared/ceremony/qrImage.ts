/**
 * The decoder of an uploaded QR image: the Aadhaar secure QR code encodes one
 * big number, which the prover takes as its decimal text.
 *
 * The image is drawn on a canvas and its pixels decoded, at its own size
 * unless its longest side passes a cap, where it is scaled down to the cap
 * with its proportions kept. A large photo often fails at that size, so a
 * decode that finds nothing or throws is tried once more with the image
 * scaled to a fixed width, its proportions kept. That retry keeps the same
 * cap on its longest side, so a tall image is drawn at most at the cap's
 * height, and a retry that would draw the first pass's size again is not made.
 * A small image is still tried again larger.
 */
import jsQR from 'jsqr'

/** The width a failed decode is tried again at. */
export const QR_RETRY_WIDTH = 1024

/** The longest side the first decode draws the image at. */
export const QR_FIRST_PASS_MAX_SIDE = 2048

const DECIMAL = /^[0-9]+$/

/** The decimal text of the code drawn at `width` by `height`, or undefined. */
const decodeAt = (image: ImageBitmap, width: number, height: number): string | undefined => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    return undefined
  }
  context.drawImage(image, 0, 0, width, height)
  const { data } = context.getImageData(0, 0, width, height)
  const code = jsQR(data, width, height)
  return code && DECIMAL.test(code.data) ? code.data : undefined
}

/** `decodeAt`, with a throw read as no code found. */
const tryDecodeAt = (image: ImageBitmap, width: number, height: number): string | undefined => {
  try {
    return decodeAt(image, width, height)
  } catch {
    return undefined
  }
}

/** `length` scaled by `to / from`, at least one pixel. */
const scaled = (length: number, to: number, from: number): number =>
  Math.max(1, Math.round((length * to) / from))

/**
 * The decimal text of the QR code in an image file, or undefined where the
 * file is no image the browser reads, holds no code, or holds a code that is
 * not one decimal number.
 */
export const qrDataOfImage = async (file: Blob): Promise<string | undefined> => {
  let image: ImageBitmap
  try {
    image = await createImageBitmap(file)
  } catch {
    return undefined
  }
  try {
    const { width, height } = image
    if (width === 0 || height === 0) {
      return undefined
    }
    const longest = Math.max(width, height)
    const firstWidth =
      longest > QR_FIRST_PASS_MAX_SIDE ? scaled(width, QR_FIRST_PASS_MAX_SIDE, longest) : width
    const firstHeight =
      longest > QR_FIRST_PASS_MAX_SIDE ? scaled(height, QR_FIRST_PASS_MAX_SIDE, longest) : height
    const found = tryDecodeAt(image, firstWidth, firstHeight)
    if (found !== undefined) {
      return found
    }
    const uncappedHeight = scaled(height, QR_RETRY_WIDTH, width)
    const [retryWidth, retryHeight] =
      uncappedHeight > QR_FIRST_PASS_MAX_SIDE
        ? [scaled(width, QR_FIRST_PASS_MAX_SIDE, height), QR_FIRST_PASS_MAX_SIDE]
        : [QR_RETRY_WIDTH, uncappedHeight]
    if (retryWidth === firstWidth && retryHeight === firstHeight) {
      return undefined
    }
    return tryDecodeAt(image, retryWidth, retryHeight)
  } finally {
    image.close?.()
  }
}
