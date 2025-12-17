import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

declare const __APP_VERSION__: string

export const GET: RequestHandler = async () => {
  return json({ version: __APP_VERSION__ })
}
