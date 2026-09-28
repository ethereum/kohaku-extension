/**
 * The records live in the extension's local storage, never in a background
 * controller, since the worker restarts and clears its controllers. So no
 * production file of the records imports from a controllers folder.
 */
import fs from 'fs'
import path from 'path'

const RECORDS_DIR = path.resolve(__dirname, '..')

const productionFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : productionFiles(full)
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [full] : []
  })

// Every module specifier of an import, export-from, require or dynamic import.
const specifiers = (source: string): string[] => {
  const found: string[] = []
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g
  ]
  patterns.forEach((pattern) => {
    let match = pattern.exec(source)
    while (match) {
      found.push(match[1])
      match = pattern.exec(source)
    }
  })
  return found
}

describe('shared/records imports no controller', () => {
  it('imports nothing from a controllers folder', () => {
    const files = productionFiles(RECORDS_DIR)
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.flatMap((file) =>
      specifiers(fs.readFileSync(file, 'utf8'))
        .filter((spec) => /(^|\/)controllers(\/|$)/.test(spec))
        .map((spec) => `${path.relative(RECORDS_DIR, file)}: ${spec}`)
    )
    expect(offenders).toEqual([])
  })
})
