import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const PUBLIC_VAPID_KEY = 'BF494SjR6g-Xs86XCTRJUWEJQBglMDHT8jJMYzmdaZpMFmMKq3wjSbhh97iM0feDfWPx8X2H8U8KOQzHn8tj1vk'
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/firebase_messaging'

type SupabaseClient = ReturnType<typeof createClient>
type Notification = { id: string; user_id: string; title: string; message: string }

// Avisos nativos (iPhone / Android) a través de Firebase Cloud Messaging.
async function sendToNativeDevices(supabase: SupabaseClient, notif: Notification) {
  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  const connectionKey = Deno.env.get('FIREBASE_MESSAGING_API_KEY')
  if (!lovableKey || !connectionKey) {
    console.error('Faltan credenciales de Firebase: no se envían avisos a las apps')
    return 0
  }

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, token')
    .eq('user_id', notif.user_id)
  if (error) {
    console.error('No se pudieron leer los dispositivos:', error.message)
    return 0
  }

  let sent = 0
  for (const device of tokens || []) {
    try {
      const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': connectionKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title: notif.title, body: notif.message },
            data: { notification_id: notif.id },
            android: { priority: 'HIGH' },
            apns: {
              payload: { aps: { sound: 'default', badge: 1, 'content-available': 1 } },
            },
          },
        }),
      })

      if (res.ok) {
        sent++
        continue
      }

      const body = await res.text()
      console.error(`Fallo al enviar al móvil [${res.status}]: ${body}`)
      // Token obsoleto o dispositivo desinstalado: se quita de la lista.
      if (res.status === 404 || /UNREGISTERED/.test(body) || /INVALID_ARGUMENT[\s\S]*message\.token/.test(body)) {
        await supabase.from('device_tokens').delete().eq('id', device.id)
      }
    } catch (e) {
      console.error('Error enviando al móvil:', e)
    }
  }
  return sent
}

// Avisos web (navegador o app añadida a la pantalla de inicio).
async function sendToWebDevices(supabase: SupabaseClient, notif: Notification) {
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
      console.error('push web failed', e?.statusCode, e?.body)
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
  }
  return sent
}

// Llamada desde un disparador de la base de datos al crear una notificación.
// Solo envía notificaciones reales, recientes y aún no enviadas, así que es
// seguro dejarla sin clave secreta.
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

    const [native, web] = await Promise.all([
      sendToNativeDevices(supabase, notif),
      sendToWebDevices(supabase, notif),
    ])

    return new Response(JSON.stringify({ sent: native + web, native, web }), { status: 200 })
  } catch (e) {
    console.error(e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
