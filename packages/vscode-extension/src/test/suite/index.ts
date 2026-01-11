import * as path from 'path'
import Mocha from 'mocha'
import { glob } from 'glob'

console.log('[TEST] Suite index.ts loaded')

export async function run(): Promise<void> {
  console.log('[TEST] run() called')
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 60000,
  })

  const testsRoot = path.resolve(__dirname, '.')
  console.log('[TEST] testsRoot:', testsRoot)

  const files = await glob('**/*.test.js', { cwd: testsRoot })
  console.log('[TEST] Found test files:', files)

  files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)))

  return new Promise((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`))
      } else {
        resolve()
      }
    })
  })
}
