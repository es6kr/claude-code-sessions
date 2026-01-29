#!/usr/bin/env node
/**
 * Check for reserved npm script names that conflict with pnpm commands.
 * These scripts override pnpm's default behavior and cause issues in CI.
 *
 * Reserved names: install, publish, run
 * - "publish" causes pnpm publish to run the script instead of publishing
 * - "install" runs after dependencies are installed
 * - "run" conflicts with pnpm run command
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RESERVED_SCRIPTS = ['install', 'publish', 'run']

function findPackageJsonFiles(dir, files = []) {
  const entries = readdirSync(dir)

  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git') continue

    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      findPackageJsonFiles(fullPath, files)
    } else if (entry === 'package.json') {
      files.push(fullPath)
    }
  }

  return files
}

function checkPackageJson(filePath) {
  const content = JSON.parse(readFileSync(filePath, 'utf-8'))
  const scripts = content.scripts || {}
  const violations = []

  for (const reserved of RESERVED_SCRIPTS) {
    if (reserved in scripts) {
      violations.push({
        script: reserved,
        value: scripts[reserved],
      })
    }
  }

  return violations
}

const rootDir = process.cwd()
const packageFiles = findPackageJsonFiles(rootDir)
let hasErrors = false

for (const file of packageFiles) {
  const violations = checkPackageJson(file)

  if (violations.length > 0) {
    hasErrors = true
    const relativePath = relative(rootDir, file)
    console.error(`\n❌ ${relativePath}`)

    for (const v of violations) {
      console.error(`   Reserved script "${v.script}" found: "${v.value}"`)
      console.error(`   → Rename to "${v.script}:local" or similar to avoid conflicts with pnpm`)
    }
  }
}

if (hasErrors) {
  console.error('\n⚠️  Reserved script names conflict with pnpm commands and break CI.')
  process.exit(1)
} else {
  console.log('✓ No reserved script names found')
}
