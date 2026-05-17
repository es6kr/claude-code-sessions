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
export const access = async () => {
  throw new Error('access not implemented in browser')
}
export const unlink = async () => {
  throw new Error('unlink not implemented in browser')
}
export const mkdir = async () => {
  throw new Error('mkdir not implemented in browser')
}
export const rename = async () => {
  throw new Error('rename not implemented in browser')
}
export const rmdir = async () => {
  throw new Error('rmdir not implemented in browser')
}

const defaultExport = {
  readFile,
  writeFile,
  stat,
  readdir,
  access,
  unlink,
  mkdir,
  rename,
  rmdir,
}
export default defaultExport
