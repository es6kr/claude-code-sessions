import { getContext, setContext } from 'svelte'

export interface SessionApi {
  openFile(filePath: string): Promise<{ success: boolean; error?: string }>
  checkFileExists(filePath: string): Promise<boolean>
}

export interface SessionStorage {
  get(key: string): string | null
  set(key: string, value: string): void
}

export interface SessionContext {
  api: SessionApi
  storage: SessionStorage
}

const KEY = Symbol('claude-sessions-context')

export const provideSessionContext = (ctx: SessionContext): void => {
  setContext(KEY, ctx)
}

export const useSession = (): SessionContext => {
  const ctx = getContext<SessionContext>(KEY)
  if (!ctx) {
    throw new Error(
      'useSession() called outside of a SessionContext provider. ' +
        'Call provideSessionContext({ api, storage }) in a parent component.'
    )
  }
  return ctx
}
