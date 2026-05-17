export const readFile = async () => {
  throw new Error('readFile not implemented in browser')
}
export const writeFile = async () => {
  throw new Error('writeFile not implemented in browser')
}
export const stat = async () => {
  throw new Error('stat not implemented in browser')
}
export const readdir = async () => {
  throw new Error('readdir not implemented in browser')
}

const defaultExport = {
  readFile,
  writeFile,
  stat,
  readdir,
}
export default defaultExport
