import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const MAILCHIMP_API_KEY = Deno.env.get('MAILCHIMP_API_KEY')!
const MAILCHIMP_SERVER = Deno.env.get('MAILCHIMP_SERVER')!
const MAILCHIMP_AUDIENCE_ID = Deno.env.get('MAILCHIMP_AUDIENCE_ID')!

serve(async (req) => {
  try {
    const payload = await req.json()

    // Database webhook sends the new row under payload.record
    const record = payload.record
    const email = record?.email
    const name = record?.full_name || ''

    if (!email) {
      return new Response('No email found', { status: 400 })
    }

    const url = `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/lists/${MAILCHIMP_AUDIENCE_ID}/members`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`anystring:${MAILCHIMP_API_KEY}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email_address: email.toLowerCase().trim(),
        status: 'subscribed',
        merge_fields: {
          FNAME: name.split(' ')[0] || '',
        },
        tags: ['app-user'],
      }),
    })

    const data = await response.json()

    // Already exists — not an error
    if (response.status === 400 && data.title === 'Member Exists') {
      return new Response('Already subscribed', { status: 200 })
    }

    if (!response.ok) {
      console.error('Mailchimp error:', data)
      return new Response('Mailchimp error', { status: 500 })
    }

    return new Response('OK', { status: 200 })

  } catch (err) {
    console.error('Edge function error:', err)
    return new Response('Internal error', { status: 500 })
  }
})