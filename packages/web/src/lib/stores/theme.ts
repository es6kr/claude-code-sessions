import { writable, derived } from 'svelte/store'

export type ThemePreference = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

const getStoredPreference = (): ThemePreference => {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

const getSystemTheme = (): EffectiveTheme => {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const themePreference = writable<ThemePreference>(getStoredPreference())

export const effectiveTheme = derived(themePreference, ($pref) => {
  if ($pref === 'system') return getSystemTheme()
  return $pref
})

const applyTheme = (theme: EffectiveTheme) => {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
}

export const initTheme = () => {
  // Apply initial theme
  const pref = getStoredPreference()
  const initial = pref === 'system' ? getSystemTheme() : pref
  applyTheme(initial)

  // Listen for OS theme changes
  const mql = window.matchMedia('(prefers-color-scheme: light)')
  const handleChange = () => {
    let currentPref: ThemePreference = 'system'
    themePreference.subscribe((v) => (currentPref = v))()
    if (currentPref === 'system') {
      applyTheme(getSystemTheme())
    }
  }
  mql.addEventListener('change', handleChange)

  // Subscribe to store changes
  const unsub = effectiveTheme.subscribe((theme) => {
    applyTheme(theme)
  })

  // Persist preference changes
  const unsubPref = themePreference.subscribe((pref) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', pref)
    }
  })

  return () => {
    mql.removeEventListener('change', handleChange)
    unsub()
    unsubPref()
  }
}

export const toggleTheme = () => {
  themePreference.update((current) => {
    const order: ThemePreference[] = ['light', 'dark', 'system']
    const idx = order.indexOf(current)
    return order[(idx + 1) % order.length]
  })
}
