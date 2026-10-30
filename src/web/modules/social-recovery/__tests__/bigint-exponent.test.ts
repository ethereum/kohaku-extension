/**
 * No source file of the module raises a bigint to a power with `**`. The
 * build's Babel compiles `**` to Math.pow, which throws on a bigint when the
 * module loads; ts-jest keeps `**`, so no other test sees the fault.
 */
import fs from 'fs'
import path from 'path'

const MODULE_ROOT = path.resolve(__dirname, '..')

const BIGINT_OPERAND = String.raw`(?:\b\d[\d_]*n\b|\bBigInt\((?:[^()]|\([^()]*\))*\))`
const BIGINT_EXPONENT = new RegExp(
  String.raw`${BIGINT_OPERAND}\s*\*\*|\*\*=?\s*(?:\b\d[\d_]*n\b|\bBigInt\()`
)

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full)
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      return []
    }
    return [full]
  })

describe('bigint exponents in the module source', () => {
  it('uses no `**` on a bigint, since the build compiles it to Math.pow, which throws on a bigint at module load', () => {
    const files = sourceFiles(MODULE_ROOT)
    expect(files.length).toBeGreaterThan(0)

    const offenders = files.flatMap((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          BIGINT_EXPONENT.test(line)
            ? [`${path.relative(MODULE_ROOT, file)}:${i + 1}: ${line.trim()}`]
            : []
        )
    )
    expect(offenders).toEqual([])
  })
})
