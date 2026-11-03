/**
 * `it.each` without its typings: the repository's type roots declare the
 * mocha globals over Jest's, so tsc knows no `.each`. A row of a table of
 * tuples spreads into the test, and the title's `%s` or `%i` names a row by
 * its first member.
 */
export function eachIt<T extends readonly unknown[] | [unknown]>(
  cases: readonly T[]
): (title: string, fn: (...row: T) => unknown) => void
export function eachIt<T extends string | number>(
  cases: readonly T[]
): (title: string, fn: (value: T) => unknown) => void
export function eachIt(cases: readonly unknown[]) {
  return (title: string, fn: (...row: unknown[]) => unknown) =>
    cases.forEach((value) => {
      const row: readonly unknown[] = Array.isArray(value) ? value : [value]
      it(title.replace(/%[si]/, String(row[0])), () => fn(...row))
    })
}
