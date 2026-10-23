// Diagnóstico temporal: solo dice si las credenciales están disponibles (sí/no).
// No devuelve ningún valor de credencial.
Deno.serve(() => {
  const present = (name: string) => Boolean(Deno.env.get(name));
  return new Response(
    JSON.stringify({
      LOVABLE_API_KEY: present('LOVABLE_API_KEY'),
      FIREBASE_MESSAGING_API_KEY: present('FIREBASE_MESSAGING_API_KEY'),
      VAPID_PRIVATE_KEY: present('VAPID_PRIVATE_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: present('SUPABASE_SERVICE_ROLE_KEY'),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
