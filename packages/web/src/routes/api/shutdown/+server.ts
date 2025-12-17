import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async () => {
  // Schedule shutdown after sending response
  setTimeout(() => {
    process.exit(0)
  }, 100)

  return json({ success: true, message: 'Server shutting down' })
}
