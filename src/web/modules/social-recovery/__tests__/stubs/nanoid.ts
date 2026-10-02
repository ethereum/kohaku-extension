// Stands in for nanoid: the package ships only ESM, which Jest cannot load.
let count = 0

export const nanoid = () => {
  count += 1
  return `id${count}`
}
