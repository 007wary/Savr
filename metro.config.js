const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Exclude supabase functions folder from bundling
config.resolver.blockList = [
  /supabase\/functions\/.*/,
]

module.exports = config
