CREATE POLICY "Users can create own bookings" ON public.class_bookings FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id AND NOT public.is_user_blocked(auth.uid()) AND public.check_booking_limit(auth.uid())) OR public.has_role(auth.uid(), 'admin'::app_role));
GRANT INSERT ON public.class_bookings TO authenticated;