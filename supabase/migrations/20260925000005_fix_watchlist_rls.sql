-- watchlist RLS javítása - anon role hozzáférés
-- A user a Vercelen anonim (nincs auth bejelentkezés), ezért minden művelethez kell engedély

DROP POLICY IF EXISTS "Allow all access" ON public.watchlist;

CREATE POLICY "Allow all access" ON public.watchlist
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.watchlist TO anon, authenticated, service_role;
