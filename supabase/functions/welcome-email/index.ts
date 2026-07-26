import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const MAILCHIMP_API_KEY = Deno.env.get('MAILCHIMP_API_KEY')!
const MAILCHIMP_SERVER = Deno.env.get('MAILCHIMP_SERVER')!
const MAILCHIMP_AUDIENCE_ID = Deno.env.get('MAILCHIMP_AUDIENCE_ID')!

// Constant-time string comparison so a caller can't discover the secret one
// character at a time from response-timing differences.
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

serve(async (req) => {
  try {
    // The on_new_user_profile trigger calls this with
    // `Authorization: Bearer <welcome_email_service_key>` (from Vault). The
    // platform's verify_jwt only proves the caller holds *some* valid JWT —
    // including the anon key baked into the shipped app — so without this
    // check anyone could POST an arbitrary { record: { email } } and subscribe
    // any address on our quota to Mailchimp.
    // Require the shared trigger secret to prove the request is really the
    // trigger.
    const expectedSecret = Deno.env.get('WELCOME_EMAIL_SERVICE_KEY')
    if (!expectedSecret) {
      console.error('welcome-email misconfigured: WELCOME_EMAIL_SERVICE_KEY not set')
      return new Response('Server misconfigured', { status: 500 })
    }
    const authHeader = req.headers.get('Authorization') || ''
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!timingSafeEqual(providedSecret, expectedSecret)) {
      return new Response('Unauthorized', { status: 401 })
    }

    const payload = await req.json()
    const record = payload.record
    const email = record?.email
    const name = typeof record?.full_name === 'string' ? record.full_name : ''

    if (!email || typeof email !== 'string') {
      return new Response('No email found', { status: 400 })
    }

    const normalised = email.toLowerCase().trim()
    const firstName = name.split(' ')[0] || ''

    // Add to Mailchimp tagged app-user
    await fetch(
      `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`anystring:${MAILCHIMP_API_KEY}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email_address: normalised,
          status: 'subscribed',
          merge_fields: { FNAME: firstName },
          tags: ['app-user'],
        }),
      }
    )

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('Edge function error:', err)
    return new Response('Internal error', { status: 500 })
  }
})