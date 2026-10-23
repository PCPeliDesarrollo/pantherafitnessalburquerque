import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const PUBLIC_VAPID_KEY = 'BF494SjR6g-Xs86XCTRJUWEJQBglMDHT8jJMYzmdaZpMFmMKq3wjSbhh97iM0feDfWPx8X2H8U8KOQzHn8tj1vk'

// Called by a DB trigger on notifications insert. Only pushes real, recent,
// not-yet-pushed notifications to their owner, so it is safe without a secret.
Deno.serve(async (req) => {
  try {
    const { notification_id } = await req.json()
    if (typeof notification_id !== 'string') return new Response('bad request', { status: 400 })

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: notif } = await supabase
      .from('notifications')
      .update({ pushed_at: new Date().toISOString() })
      .eq('id', notification_id)
      .is('pushed_at', null)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .select('id, user_id, title, message')
      .maybeSingle()
    if (!notif) return new Response(JSON.stringify({ skipped: true }), { status: 200 })

    webpush.setVapidDetails(
      'mailto:info@pantherafitnessalburquerque.es',
      PUBLIC_VAPID_KEY,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    )

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', notif.user_id)

    let sent = 0
    for (const s of subs || []) {
      try {
        await webpush.sendNotification(
          s.subscription as any,
          JSON.stringify({ title: notif.title, message: notif.message, id: notif.id }),
        )
        sent++
      } catch (e: any) {
        console.error('push failed', e?.statusCode, e?.body)
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        }
      }
    }
    return new Response(JSON.stringify({ sent }), { status: 200 })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
