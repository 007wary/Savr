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

  // Read the saved preference in the background. We do NOT gate rendering on it:
  // blocking here returned null, which stopped RootLayoutInner from mounting at
  // all, so the launch gate + session resolution couldn't even start and the
  // native splash stayed up the whole time. Defaulting to 'system' (which
  // resolves to the OS scheme) means the vast majority of launches show the
  // correct colors on the first frame anyway; an explicit light/dark override
  // applies one frame later, before real content has painted.
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved)
      }
    }).catch(() => {})
  }, [])

  const setTheme = async (newTheme) => {
    setThemeState(newTheme)
    await AsyncStorage.setItem(THEME_KEY, newTheme).catch(() => {})
  }

  const resolvedScheme = theme === 'system' ? (systemScheme ?? 'dark') : theme
  const COLORS = resolvedScheme === 'light' ? LIGHT_COLORS : DARK_COLORS

  return (
    <ThemeContext.Provider value={{ COLORS, theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}