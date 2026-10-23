/**
 * @jest-environment jsdom
 */
/**
 * The decoder of an uploaded QR image reads the decimal number an Aadhaar
 * secure QR code encodes, and nothing else. jsdom has no canvas and no image
 * decoding, so a small harness stands in for both: `createImageBitmap` hands
 * back the picture a test attached to the file, and the canvas's 2D context
 * hands back that picture's pixels at the size the decoder drew it. The code's
 * pixels come from the `qrcode` package and the decoder's own `jsqr` reads
 * them, so a code is decoded for real.
 */
import { qrDataOfImage } from '@web/modules/social-recovery/shared/ceremony/qrImage'
import type {
  CanvasDraw,
  FakePicture,
  QrCodeLibrary
} from '@web/modules/social-recovery/shared/ceremony/__fixtures__/types'

/* eslint-disable @typescript-eslint/no-var-requires, global-require, import/no-extraneous-dependencies */
// jsdom has no TextEncoder, which the package's byte mode reads.
if (typeof globalThis.TextEncoder === 'undefined') {
  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    value: (require('util') as { TextEncoder: typeof TextEncoder }).TextEncoder
  })
}
// The package ships no types; the test reads it through its own.
const QRCode = require('qrcode') as QrCodeLibrary
/* eslint-enable @typescript-eslint/no-var-requires, global-require, import/no-extraneous-dependencies */

const AADHAAR_NUMBER =
  '2374971804270526477833002468783965837992554564899874087591661303561346432389'
const QUIET_MODULES = 4

/** A picture of the code of `text`, drawn by nearest neighbour at any size. */
const codePicture = (text: string, width = 300, height = width): FakePicture => {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules
  const span = size + 2 * QUIET_MODULES
  return {
    width,
    height,
    pixelsAt: (w, h) => {
      const pixels = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const col = Math.floor((x * span) / w) - QUIET_MODULES
          const row = Math.floor((y * span) / h) - QUIET_MODULES
          const inside = col >= 0 && row >= 0 && col < size && row < size
          const shade = inside && data[row * size + col] ? 0 : 255
          const at = (y * w + x) * 4
          pixels[at] = shade
          pixels[at + 1] = shade
          pixels[at + 2] = shade
          pixels[at + 3] = 255
        }
      }
      return pixels
    }
  }
}

/** A picture with no code: every pixel white. */
const blankPicture = (width = 300, height = width): FakePicture => ({
  width,
  height,
  pixelsAt: (w, h) => new Uint8ClampedArray(w * h * 4).fill(255)
})

/** A photo the decoder misses at its full size and reads once drawn narrower. */
const largePhoto = (text: string, width: number, height: number): FakePicture => {
  const code = codePicture(text, width, height)
  return {
    ...code,
    pixelsAt: (w, h) => (w === width ? blankPicture().pixelsAt(w, h) : code.pixelsAt(w, h))
  }
}

const pictures = new WeakMap<Blob, FakePicture>()
let draws: CanvasDraw[] = []
let closed = 0
let noContext = false

const fileOf = (picture: FakePicture): Blob => {
  const file = new Blob(['image'], { type: 'image/png' })
  pictures.set(file, picture)
  return file
}

beforeEach(() => {
  draws = []
  closed = 0
  noContext = false
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async (file: Blob) => {
      const picture = pictures.get(file)
      if (!picture) {
        throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
      }
      return {
        width: picture.width,
        height: picture.height,
        picture,
        close: () => {
          closed += 1
        }
      }
    }
  })
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    if (noContext) {
      return null
    }
    let drawn: { picture: FakePicture; width: number; height: number } | null = null
    return {
      drawImage: (
        image: { picture: FakePicture },
        _x: number,
        _y: number,
        w: number,
        h: number
      ) => {
        drawn = { picture: image.picture, width: w, height: h }
        draws.push({ width: w, height: h })
      },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: drawn ? drawn.picture.pixelsAt(w, h) : new Uint8ClampedArray(w * h * 4)
      })
    } as unknown as CanvasRenderingContext2D
  })
})

afterEach(() => {
  jest.restoreAllMocks()
  delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap
})

describe('the decoder of an uploaded QR image', () => {
  it('reads the decimal number the code encodes, at the first try', async () => {
    await expect(qrDataOfImage(fileOf(codePicture(AADHAAR_NUMBER)))).resolves.toBe(AADHAAR_NUMBER)
    expect(draws).toEqual([{ width: 300, height: 300 }])
  })

  it('reads a short decimal number too', async () => {
    await expect(qrDataOfImage(fileOf(codePicture('42')))).resolves.toBe('42')
  })
  ;['hello', '12 34', '0x1234', '-42', '42.5'].forEach((text) =>
    it(`reads a code of '${text}', which is no decimal number, as no Aadhaar code`, async () => {
      await expect(qrDataOfImage(fileOf(codePicture(text)))).resolves.toBeUndefined()
    })
  )

  it('reads an image with no code as nothing', async () => {
    await expect(qrDataOfImage(fileOf(blankPicture()))).resolves.toBeUndefined()
  })

  it('reads a file the browser cannot draw as nothing', async () => {
    await expect(
      qrDataOfImage(new Blob(['%PDF-1.7'], { type: 'image/png' }))
    ).resolves.toBeUndefined()
    expect(draws).toEqual([])
  })

  it('reads an empty image as nothing, and draws nothing', async () => {
    await expect(qrDataOfImage(fileOf(blankPicture(0, 0)))).resolves.toBeUndefined()
    expect(draws).toEqual([])
  })

  it('reads nothing where the page offers no 2D canvas', async () => {
    noContext = true
    await expect(qrDataOfImage(fileOf(codePicture(AADHAAR_NUMBER)))).resolves.toBeUndefined()
  })

  it('tries a large photo it cannot read once more at 1024 wide, keeping its proportions', async () => {
    const photo = largePhoto(AADHAAR_NUMBER, 1500, 2000)
    await expect(qrDataOfImage(fileOf(photo))).resolves.toBe(AADHAAR_NUMBER)
    expect(draws).toEqual([
      { width: 1500, height: 2000 },
      { width: 1024, height: 1365 }
    ])
  })

  it('tries once more at 1024 wide where the first draw throws, and reads the code there', async () => {
    const code = codePicture(AADHAAR_NUMBER, 1500, 2000)
    const throwing: FakePicture = {
      ...code,
      pixelsAt: (w, h) => {
        if (w === 1500) {
          throw new RangeError('The canvas is too large to read.')
        }
        return code.pixelsAt(w, h)
      }
    }
    await expect(qrDataOfImage(fileOf(throwing))).resolves.toBe(AADHAAR_NUMBER)
    expect(draws).toEqual([
      { width: 1500, height: 2000 },
      { width: 1024, height: 1365 }
    ])
    expect(closed).toBe(1)
  })

  it('reads nothing, and releases the image, where both draws throw', async () => {
    const throwing: FakePicture = {
      ...blankPicture(1500, 2000),
      pixelsAt: () => {
        throw new RangeError('The canvas is too large to read.')
      }
    }
    await expect(qrDataOfImage(fileOf(throwing))).resolves.toBeUndefined()
    expect(draws).toHaveLength(2)
    expect(closed).toBe(1)
  })

  it('first draws a photo longer than 2048 on a side at 2048, keeping its proportions', async () => {
    await expect(qrDataOfImage(fileOf(codePicture(AADHAAR_NUMBER, 3000, 4000)))).resolves.toBe(
      AADHAAR_NUMBER
    )
    expect(draws).toEqual([{ width: 1536, height: 2048 }])
  })

  it('tries a wide photo above the cap once more at 1024 wide where the capped draw reads nothing', async () => {
    await expect(qrDataOfImage(fileOf(blankPicture(4096, 1000)))).resolves.toBeUndefined()
    expect(draws).toEqual([
      { width: 2048, height: 500 },
      { width: 1024, height: 250 }
    ])
  })

  it('tries a small image once more at 1024 wide too, and reads nothing where neither holds a code', async () => {
    await expect(qrDataOfImage(fileOf(blankPicture(200, 100)))).resolves.toBeUndefined()
    expect(draws).toEqual([
      { width: 200, height: 100 },
      { width: 1024, height: 512 }
    ])
  })

  it('makes no second try for an image already 1024 wide', async () => {
    await expect(qrDataOfImage(fileOf(blankPicture(1024, 800)))).resolves.toBeUndefined()
    expect(draws).toEqual([{ width: 1024, height: 800 }])
  })

  it('caps the second try of a tall photo at 2048 high, keeping its proportions', async () => {
    await expect(qrDataOfImage(fileOf(blankPicture(1080, 20000)))).resolves.toBeUndefined()
    expect(draws).toEqual([{ width: 111, height: 2048 }])
  })

  it('makes no second try where the capped retry would draw the first size again', async () => {
    await expect(qrDataOfImage(fileOf(blankPicture(21, 4096)))).resolves.toBeUndefined()
    expect(draws).toEqual([{ width: 11, height: 2048 }])
  })

  it('tries a tall image under the cap once more larger, up to 2048 high', async () => {
    await expect(qrDataOfImage(fileOf(blankPicture(500, 1500)))).resolves.toBeUndefined()
    expect(draws).toEqual([
      { width: 500, height: 1500 },
      { width: 683, height: 2048 }
    ])
  })

  it('releases the drawn image whether it read a code or not', async () => {
    await qrDataOfImage(fileOf(codePicture(AADHAAR_NUMBER)))
    await qrDataOfImage(fileOf(blankPicture()))
    noContext = true
    await qrDataOfImage(fileOf(codePicture(AADHAAR_NUMBER)))
    expect(closed).toBe(3)
  })
})
