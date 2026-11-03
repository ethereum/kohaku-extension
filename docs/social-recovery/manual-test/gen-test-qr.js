// Makes a fresh Anon Aadhaar test QR code for a manual walk on the test-only Aadhaar module.
//
// It takes the official UIDAI V1 sample data in dataInput.json (the sample anon-aadhaar's own
// generator uses), turns it into V2 data timestamped now with the core's createCustomV2TestData, signs it with Anon Aadhaar's published test key pair, checks the
// signature against the test certificate, and writes <out>.txt (the decimal string the upload field
// takes) and <out>.png (the QR image).
//
// No key is kept in this repository. The three test files live in the anon-aadhaar/anon-aadhaar
// repository under packages/circuits/assets/: testPrivateKey.pem, testPublicKey.pem and
// testCertificate.pem. Their private half is public, so a QR code made here proves nothing about a
// person and is for the test-only module alone.
//
// Usage, from the repository root:
//   node docs/social-recovery/manual-test/gen-test-qr.js --key <testPrivateKey.pem> --cert <testCertificate.pem> [--out <basename>] [--other]
// or with AADHAAR_TEST_PRIVATE_KEY and AADHAAR_TEST_CERTIFICATE set to the two paths.
// --out defaults to ./test-qr. --other makes the QR code of one fixed other identity, for the
// mismatch test: the photo bytes are flipped the same way on every run, so the nullifier differs
// from the plain code's and stays the same across runs.
const crypto = require('crypto')
const fs = require('fs')
const { createRequire } = require('module')
const path = require('path')

// The packages resolve from the repository root this runs in, the install the extension uses.
const fromRoot = createRequire(path.join(process.cwd(), 'package.json'))
const core = fromRoot('@anon-aadhaar/core')
const QR = fromRoot('qrcode')

const argumentOf = (name) => {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}

const USAGE = [
  'Usage, from the repository root:',
  '  node docs/social-recovery/manual-test/gen-test-qr.js --key <testPrivateKey.pem> --cert <testCertificate.pem> [--out <basename>] [--other]',
  'or with AADHAAR_TEST_PRIVATE_KEY and AADHAAR_TEST_CERTIFICATE set to the two paths.',
  '  --out    the base name of the .txt and .png it writes (default ./test-qr)',
  '  --other  the QR code of one fixed other identity, for the mismatch test',
  'The test files are in anon-aadhaar/anon-aadhaar under packages/circuits/assets/.'
].join('\n')

if (process.argv.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}

const keyPath = argumentOf('--key') ?? process.env.AADHAAR_TEST_PRIVATE_KEY
const certificatePath = argumentOf('--cert') ?? process.env.AADHAAR_TEST_CERTIFICATE
const out = argumentOf('--out') ?? 'test-qr'
const other = process.argv.includes('--other')

if (!keyPath || !certificatePath) {
  console.error(`Give the test private key and the test certificate.\n\n${USAGE}`)
  process.exit(1)
}

const data = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'dataInput.json'), 'utf8')
).testQRDataV1
const decoded = core.decompressByteArray(core.convertBigIntToByteArray(BigInt(data)))
// The last 256 bytes of the sample are its own signature.
const sampleData = core.createCustomV2TestData({
  signedData: decoded.slice(0, decoded.length - 256)
})

// The other identity: the photo's bytes each with the low bit flipped, the same on every run.
// 0xfe and 0xff stay as they are, so no field delimiter appears or disappears in the photo.
const otherIdentity = (signed) => {
  const { begin, dataLength } = core.extractPhoto(Array.from(signed), signed.length)
  const fixed = signed.slice(begin + 1, dataLength).map((byte) => {
    if (byte >= 0xfe) {
      return byte
    }
    return byte % 2 === 0 ? byte + 1 : byte - 1
  })
  return core.replaceBytesBetween(signed, fixed, begin + 1, dataLength - 1)
}

const dataToSign = other ? otherIdentity(sampleData) : sampleData

const signer = crypto.createSign('sha256')
signer.update(Buffer.from(dataToSign))
signer.end()
const signature = signer.sign({ key: fs.readFileSync(keyPath, 'utf8') })

const certificate = crypto.createPublicKey(fs.readFileSync(certificatePath, 'utf8'))
const verifies = crypto.verify(
  'sha256',
  Buffer.from(dataToSign),
  { key: certificate, padding: crypto.constants.RSA_PKCS1_PADDING },
  signature
)
if (!verifies) {
  console.error(
    'The signature does not verify with the certificate given: the key and the certificate are not a pair.'
  )
  process.exit(1)
}

const qr = core
  .rawDataToCompressedQR(Buffer.concat([Buffer.from(dataToSign), signature]))
  .toString()
fs.writeFileSync(`${out}.txt`, qr)
const fields = Buffer.from(dataToSign).toString('latin1').split('\xff')
QR.toFile(`${out}.png`, [{ data: qr, mode: 'numeric' }], {
  errorCorrectionLevel: 'L',
  scale: 3,
  margin: 4
}).then(() => {
  // The reference id is the last four digits of the number, then the signing time as YYYYMMDDhhmmssSSS.
  console.log(
    `digits ${qr.length}, reference ${fields[2]}, name ${fields[3]}, wrote ${out}.txt and ${out}.png`
  )
})
