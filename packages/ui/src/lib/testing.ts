import type { SessionApi, SessionContext, SessionStorage } from './context'

const noopApi: SessionApi = {
  openFile: async () => ({ success: true }),
  checkFileExists: async () => true,
}

const memoryStorage = (): SessionStorage => {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value)
    },
  }
}

export const createMockSessionContext = (
  overrides: Partial<SessionContext> = {}
): SessionContext => ({
  api: { ...noopApi, ...(overrides.api ?? {}) },
  storage: overrides.storage ?? memoryStorage(),
})
