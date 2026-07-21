import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const MAILCHIMP_API_KEY = Deno.env.get('MAILCHIMP_API_KEY')!
const MAILCHIMP_SERVER = Deno.env.get('MAILCHIMP_SERVER')!
const MAILCHIMP_AUDIENCE_ID = Deno.env.get('MAILCHIMP_AUDIENCE_ID')!
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!

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
    // check anyone could POST an arbitrary { record: { email } } and send a
    // welcome email / Mailchimp subscription to any address on our quota.
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
    const mcResponse = await fetch(
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

    const mcData = await mcResponse.json()
    const alreadyExists = mcResponse.status === 400 && mcData.title === 'Member Exists'

    // Only send welcome email to new users
    if (!alreadyExists) {
      const footer = `
        <div style="border-top:1px solid #eeeeee;padding:24px 32px;background:#f9f9f9;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <span style="font-size:14px;font-weight:700;color:#6C63FF;letter-spacing:0.05em;">SAVR</span>
                <p style="font-size:12px;color:#999999;margin:4px 0 0;">Your Money, In Control.</p>
              </td>
              <td style="text-align:right;vertical-align:middle;">
                <a href="https://savrappindia.vercel.app" style="font-size:12px;color:#6C63FF;text-decoration:none;">savrappindia.vercel.app</a>
              </td>
            </tr>
          </table>
          <p style="font-size:11px;color:#bbbbbb;margin:16px 0 0;">
            You are receiving this because you signed up for Savr on Android.
            &nbsp;|&nbsp; &copy; 2026 Wary Dev. All rights reserved.
          </p>
        </div>
      `

      const appHtml = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#ffffff;">
          <div style="background:#6C63FF;padding:24px 32px;">
            <span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.05em;">SAVR</span>
          </div>
          <div style="padding:40px 32px;">
            <h1 style="font-size:24px;font-weight:700;color:#111111;margin:0 0 16px;">Welcome to Savr.</h1>
            <p style="font-size:15px;line-height:1.7;color:#555555;margin:0 0 12px;">
              Your finances are now offline-first, private, and in your control. Everything stays on your device — no servers storing your transactions, no loan upsells, no data sharing.
            </p>
            <p style="font-size:15px;line-height:1.7;color:#555555;margin:0 0 32px;">
              Start by adding your first expense. It takes less than 10 seconds.
            </p>
            <a href="https://play.google.com/store/apps/details?id=com.saver.savr"
              style="display:inline-block;background:#6C63FF;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:600;">
              Open Savr
            </a>
          </div>
          ${footer}
        </div>
      `

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BREVO_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Savr', email: '007mwnswrangwary@gmail.com' },
          to: [{ email: normalised }],
          subject: 'Welcome to Savr.',
          htmlContent: appHtml,
        }),
      })
    }

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('Edge function error:', err)
    return new Response('Internal error', { status: 500 })
  }
})