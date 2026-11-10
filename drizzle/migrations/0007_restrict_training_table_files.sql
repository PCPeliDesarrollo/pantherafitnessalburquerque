DROP POLICY IF EXISTS "Anyone can view training table files" ON storage.objects;
CREATE POLICY "Members can view training table files" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'training-tables' AND NOT public.is_user_blocked(auth.uid()));