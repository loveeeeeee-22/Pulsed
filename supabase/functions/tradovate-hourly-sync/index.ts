/**
 * Supabase Edge Function: ping your deployed Pulsed app hourly to sync Tradovate connections.
 *
 * Secrets (Dashboard → Edge Functions → tradovate-hourly-sync → Secrets):
 *   PULSED_APP_URL    e.g. https://your-app.vercel.app
 *   TRADOVATE_CRON_SECRET  same value as in Next.js .env.local
 *
 * Schedule (Dashboard → Edge Functions → Schedules):
 *   Cron: 0 * * * *   (every hour at minute 0, UTC)
 */
Deno.serve(async () => {
  const url = Deno.env.get('PULSED_APP_URL')
  const cronSecret = Deno.env.get('TRADOVATE_CRON_SECRET')
  if (!url || !cronSecret) {
    return new Response(JSON.stringify({ error: 'Set PULSED_APP_URL and TRADOVATE_CRON_SECRET secrets' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const base = url.replace(/\/$/, '')
  const res = await fetch(`${base}/api/tradovate/cron`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cronSecret}`,
    },
  })

  const text = await res.text()
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  })
})
