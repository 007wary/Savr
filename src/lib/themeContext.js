import { createContext, useContext, useState, useEffect } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LIGHT_COLORS, DARK_COLORS } from '../constants/theme'

const THEME_KEY = 'savr_theme'

const ThemeContext = createContext({
  COLORS: DARK_COLORS,
  theme: 'system',
  setTheme: () => {},
})

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme()
  const [theme, setThemeState] = useState('system')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved)
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const setTheme = async (newTheme) => {
    setThemeState(newTheme)
    await AsyncStorage.setItem(THEME_KEY, newTheme).catch(() => {})
  }

  const resolvedScheme = theme === 'system' ? (systemScheme ?? 'dark') : theme
  const COLORS = resolvedScheme === 'light' ? LIGHT_COLORS : DARK_COLORS

  if (!loaded) return null

  return (
    <ThemeContext.Provider value={{ COLORS, theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}