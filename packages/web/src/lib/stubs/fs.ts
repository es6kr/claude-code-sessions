export const readFileSync = () => {
  throw new Error('readFileSync not implemented in browser')
}
export const writeFileSync = () => {
  throw new Error('writeFileSync not implemented in browser')
}
export const existsSync = () => false

const defaultExport = {
  readFileSync,
  writeFileSync,
  existsSync,
}
export default defaultExport
