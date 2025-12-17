import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import * as fs from 'node:fs/promises'

export const GET: RequestHandler = async ({ url }) => {
  const filePath = url.searchParams.get('path')

  if (!filePath) {
    throw error(400, 'path is required')
  }

  try {
    await fs.access(filePath)
    return json({ exists: true })
  } catch {
    return json({ exists: false })
  }
}
