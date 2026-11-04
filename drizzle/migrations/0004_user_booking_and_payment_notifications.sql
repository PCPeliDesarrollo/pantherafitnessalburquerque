CREATE OR REPLACE FUNCTION public.notify_admins_on_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text; v_class text; v_time time;
BEGIN
  SELECT trim(coalesce(full_name,'') || ' ' || coalesce(apellidos,'')) INTO v_name FROM profiles WHERE id = NEW.user_id;
  SELECT c.name, cs.start_time INTO v_class, v_time FROM class_schedules cs JOIN classes c ON c.id = cs.class_id WHERE cs.id = NEW.schedule_id;
  INSERT INTO notifications (user_id, title, message, type)
  SELECT ur.user_id,
    CASE WHEN NEW.status = 'waitlist' THEN 'Nuevo en lista de espera' ELSE 'Nueva reserva' END,
    coalesce(nullif(v_name,''),'Un cliente') || ' se ha apuntado a ' || coalesce(v_class,'una clase') || ' el ' ||
      to_char(NEW.class_date,'DD/MM/YYYY') || ' a las ' || to_char(v_time,'HH24:MI') ||
      CASE WHEN NEW.status = 'waitlist' THEN ' (lista de espera)' ELSE '' END,
    'info'
  FROM user_roles ur WHERE ur.role = 'admin' AND ur.user_id <> NEW.user_id;
  IF NEW.status = 'confirmed' THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (NEW.user_id, '✅ Te has apuntado',
      'Te has apuntado a ' || coalesce(v_class,'la clase') || ' el ' || to_char(NEW.class_date,'DD/MM/YYYY') ||
      ' a las ' || to_char(v_time,'HH24:MI') || '. Te avisaremos una hora antes.', 'success');
  END IF;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.send_class_hour_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_now timestamp := (now() AT TIME ZONE 'Europe/Madrid');
  r record;
BEGIN
  FOR r IN
    SELECT b.id, b.user_id, c.name, cs.start_time
    FROM class_bookings b
    JOIN class_schedules cs ON cs.id = b.schedule_id
    JOIN classes c ON c.id = cs.class_id
    WHERE b.status = 'confirmed' AND b.reminder_sent = false
      AND (b.class_date + cs.start_time) > v_now
      AND (b.class_date + cs.start_time) <= v_now + interval '61 minutes'
  LOOP
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (r.user_id, '⏰ Clase en 1 hora',
      'Tu clase de ' || r.name || ' empieza a las ' || to_char(r.start_time,'HH24:MI') || '. ¡Prepárate!', 'info');
    UPDATE class_bookings SET reminder_sent = true WHERE id = r.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.send_payment_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_day int := extract(day from v_today);
  v_title text; v_msg text;
  v_mes text := (ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from v_today)::int];
BEGIN
  IF v_day = 1 THEN
    v_title := '💳 Cuota de ' || v_mes;
    v_msg := 'Recuerda que la cuota de ' || v_mes || ' se paga del 1 al 5 de este mes.';
  ELSIF v_day = 4 THEN
    v_title := '💳 Quedan 2 días para pagar';
    v_msg := 'Aún no consta el pago de la cuota de ' || v_mes || '. El plazo termina el día 5.';
  ELSIF v_day = 5 THEN
    v_title := '⚠️ Último día para pagar';
    v_msg := 'Hoy es el último día para pagar la cuota de ' || v_mes || '. Mañana se bloqueará la entrada si no consta el pago.';
  ELSE
    RETURN;
  END IF;
  INSERT INTO notifications (user_id, title, message, type)
  SELECT p.id, v_title, v_msg, 'warning'
  FROM profiles p
  WHERE p.payment_exempt = false
    AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
    AND NOT EXISTS (SELECT 1 FROM monthly_payments mp WHERE mp.user_id = p.id
      AND mp.year = extract(year from v_today) AND mp.month = extract(month from v_today) AND mp.paid = true);
END $$;

REVOKE EXECUTE ON FUNCTION public.send_class_hour_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_payment_reminders() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname IN ('send-class-reminders-every-15min','send-morning-class-reminders','send-hourly-class-reminders','class-hour-reminders','payment-reminders');
END $$;
SELECT cron.schedule('class-hour-reminders', '0 * * * *', 'SELECT public.send_class_hour_reminders()');
SELECT cron.schedule('payment-reminders', '0 9 * * *', 'SELECT public.send_payment_reminders()');