
-- Pozíciók tábla a nyitott/zárt pozíciók nyilvántartásához
CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  entry_price numeric NOT NULL,
  quantity numeric NOT NULL,
  stop_loss numeric,
  take_profit numeric,
  current_price numeric,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  pnl numeric DEFAULT 0,
  pnl_pct numeric DEFAULT 0,
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read for all users" ON public.positions FOR SELECT USING (true);
CREATE POLICY "Enable insert for service role" ON public.positions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for service role" ON public.positions FOR UPDATE USING (true);
CREATE POLICY "Enable delete for service role" ON public.positions FOR DELETE USING (true);
