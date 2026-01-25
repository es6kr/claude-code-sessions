import { describe, expect, it } from 'vitest'
import { getWebPackageTag } from './server.js'

describe('getWebPackageTag', () => {
  it('returns "beta" for beta version', () => {
    expect(getWebPackageTag('0.4.1-beta.0')).toBe('beta')
    expect(getWebPackageTag('1.0.0-beta.1')).toBe('beta')
    expect(getWebPackageTag('2.0.0-beta.99')).toBe('beta')
  })

  it('returns "alpha" for alpha version', () => {
    expect(getWebPackageTag('0.4.1-alpha.0')).toBe('alpha')
    expect(getWebPackageTag('1.0.0-alpha.1')).toBe('alpha')
  })

  it('returns "latest" for stable version', () => {
    expect(getWebPackageTag('0.4.1')).toBe('latest')
    expect(getWebPackageTag('1.0.0')).toBe('latest')
    expect(getWebPackageTag('2.3.4')).toBe('latest')
  })

  it('returns "latest" for rc version (conservative)', () => {
    expect(getWebPackageTag('1.0.0-rc.1')).toBe('latest')
  })

  it('returns "latest" for unknown prerelease', () => {
    expect(getWebPackageTag('1.0.0-next.1')).toBe('latest')
  })
})
