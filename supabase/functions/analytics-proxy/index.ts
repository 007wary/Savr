import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encode as base64url } from 'https://deno.land/std@0.182.0/encoding/base64url.ts'

const SUPABASE_URL = 'https://fsrbsqhlgfdqugixqtxc.supabase.co'
const FCM_PROJECT_ID = 'savr-b6c11'

// Resolved lazily inside the request handler (not at module load) so a
// missing/invalid secret returns a clean 500 response instead of crashing
// the whole function on boot for every request.
let serviceAccount = null
function getServiceAccount() {
  if (serviceAccount) return serviceAccount
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set')
  serviceAccount = JSON.parse(raw)
  return serviceAccount
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-dashboard-secret',
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

async function getAccessToken() {
  const account = getServiceAccount()
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const enc = new TextEncoder()
  const headerB64 = base64url(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const pemKey = account.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')

  const binaryKey = Uint8Array.from(atob(pemKey), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    enc.encode(signingInput)
  )

  const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const serviceKey = Deno.env.get('SB_SERVICE_KEY')
  const dashboardSecret = Deno.env.get('DASHBOARD_SECRET')
  if (!serviceKey || !dashboardSecret) {
    console.error('analytics-proxy misconfigured: missing required secret(s)')
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const secret = req.headers.get('x-dashboard-secret')
  if (!timingSafeEqual(secret, dashboardSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  const supabase = createClient(SUPABASE_URL, serviceKey)

  if (!action || action === 'users') {
    // Deliberate allow-list — never select('*') here. This dashboard
    // endpoint is gated only by a shared header secret, not per-user auth,
    // so it must not be able to leak columns (e.g. tokens, PII) added to
    // user_profiles later without an explicit decision to expose them here.
    const { data } = await supabase
      .from('user_profiles')
      .select('id, created_at, last_active, is_online, online_at')
      .order('created_at', { ascending: false })
    return new Response(JSON.stringify(data || []), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (action === 'notify') {
    const { title, body, tokens } = await req.json()
    if (!title || !body || !tokens?.length) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let accessToken
    try {
      accessToken = await getAccessToken()
    } catch (e) {
      console.error('analytics-proxy: failed to get FCM access token', e)
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    let sent = 0
    let failed = 0

    const sendOne = async (token) => {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                android: { priority: 'high' }
              }
            })
          }
        )
        return res.ok
      } catch {
        return false
      }
    }

    // Send in parallel chunks rather than serially. One-at-a-time scales
    // linearly with token count and would approach the function timeout for
    // large broadcasts; chunking bounds concurrency so we don't open thousands
    // of sockets at once or trip FCM rate limits.
    const CHUNK_SIZE = 100
    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE)
      const results = await Promise.all(chunk.map(sendOne))
      for (const ok of results) {
        if (ok) sent++
        else failed++
      }
    }

    return new Response(JSON.stringify({ sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
