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
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_admins_on_booking_trigger ON public.class_bookings;
CREATE TRIGGER notify_admins_on_booking_trigger AFTER INSERT ON public.class_bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_booking();

DROP TRIGGER IF EXISTS before_insert_booking ON public.class_bookings;
DROP TRIGGER IF EXISTS after_delete_booking ON public.class_bookings;
DROP TRIGGER IF EXISTS notify_on_class_booking ON public.class_bookings;