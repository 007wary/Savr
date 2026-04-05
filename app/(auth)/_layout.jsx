import { Stack } from 'expo-router'
import { COLORS } from '../../src/constants/theme'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: COLORS.bg }
    }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="webview" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  )
}