'use client'
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  setThemePreference: () => {},
})

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    const saved = localStorage.getItem('theme') || 'dark'
    setTheme(saved)
    document.documentElement.setAttribute('data-theme', saved)
  }, [])

  function toggleTheme() {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme', next)
      document.documentElement.setAttribute('data-theme', next)
      return next
    })
  }

  function setThemePreference(nextTheme) {
    const normalized = nextTheme === 'light' ? 'light' : 'dark'
    setTheme(normalized)
    localStorage.setItem('theme', normalized)
    document.documentElement.setAttribute('data-theme', normalized)
  }

  // Always provide context. Previously children rendered without Provider until mounted,
  // so useTheme().toggleTheme was a no-op and theme could feel "stuck" if hydration errored.
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setThemePreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}