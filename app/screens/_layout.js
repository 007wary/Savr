import { Stack } from 'expo-router'
import { COLORS } from '../../src/constants/theme'

export default function ScreensLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.bg } }} />
  )
}