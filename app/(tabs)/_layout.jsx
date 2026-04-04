import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { COLORS } from '../../src/constants/theme'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
  headerShown: false,
  contentStyle: { backgroundColor: COLORS.bg },
  tabBarStyle: {
    backgroundColor: COLORS.card,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: 10,
    paddingTop: 8,
  },
  tabBarActiveTintColor: COLORS.accent,
  tabBarInactiveTintColor: COLORS.textMuted,
  tabBarLabelStyle: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
}}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'grid' : 'grid-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
  name="add"
  options={{
    href: null,
  }}
/>
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={22} color={color} />
          ),
        }}
      />
    <Tabs.Screen
        name="budgets"
        options={{
          title: 'Budgets',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'wallet' : 'wallet-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
  name="settings"
  options={{
    title: 'Settings',
    tabBarIcon: ({ color, focused }) => (
      <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={22} color={color} />
    ),
  }}
/>
    </Tabs>
  )
}