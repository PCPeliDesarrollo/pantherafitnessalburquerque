CREATE OR REPLACE FUNCTION public.promote_waitlist_on_capacity_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d date; free_slots integer; r record; cname text;
BEGIN
  IF NEW.max_capacity < OLD.max_capacity THEN RETURN NEW; END IF;
  SELECT name INTO cname FROM classes WHERE id = NEW.class_id;
  FOR d IN SELECT DISTINCT class_date FROM class_bookings WHERE schedule_id = NEW.id AND status='waitlist' AND class_date >= CURRENT_DATE LOOP
    SELECT NEW.max_capacity - COUNT(*) INTO free_slots FROM class_bookings WHERE schedule_id=NEW.id AND class_date=d AND status='confirmed';
    FOR r IN SELECT id, user_id FROM class_bookings WHERE schedule_id=NEW.id AND class_date=d AND status='waitlist' ORDER BY position ASC NULLS LAST, created_at LIMIT GREATEST(free_slots,0) LOOP
      UPDATE class_bookings SET status='confirmed', position=NULL WHERE id=r.id;
      INSERT INTO notifications(user_id,title,message,type) VALUES (r.user_id,'¡Plaza confirmada!',
        'Has conseguido plaza en la clase de '||cname||' del '||to_char(d,'DD/MM/YYYY')||' a las '||to_char(NEW.start_time,'HH24:MI')||'. ¡Te esperamos!','success');
    END LOOP;
    WITH w AS (SELECT id, row_number() OVER (ORDER BY position ASC NULLS LAST, created_at) rn FROM class_bookings WHERE schedule_id=NEW.id AND class_date=d AND status='waitlist')
    UPDATE class_bookings cb SET position=w.rn FROM w WHERE cb.id=w.id;
  END LOOP;
  RETURN NEW;
END $$;