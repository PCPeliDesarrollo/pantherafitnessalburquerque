-- Dispositivos registrados para recibir avisos en iPhone y Android (Firebase Cloud Messaging)
CREATE TABLE public.device_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own device tokens"
  ON public.device_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own device tokens"
  ON public.device_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all device tokens"
  ON public.device_tokens FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX device_tokens_user_id_idx ON public.device_tokens (user_id);

CREATE TRIGGER device_tokens_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Registro seguro desde la app: reemplaza el token si antes pertenecía a otra cuenta
CREATE OR REPLACE FUNCTION public.register_device_token(_token text, _platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _token IS NULL OR length(btrim(_token)) < 20 OR length(_token) > 4096 THEN
    RAISE EXCEPTION 'token de dispositivo no valido';
  END IF;
  IF _platform IS NULL OR _platform NOT IN ('android', 'ios') THEN
    RAISE EXCEPTION 'plataforma no valida';
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sesion no valida';
  END IF;

  DELETE FROM public.device_tokens WHERE token = _token;
  INSERT INTO public.device_tokens (user_id, token, platform)
  VALUES (auth.uid(), btrim(_token), _platform);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;