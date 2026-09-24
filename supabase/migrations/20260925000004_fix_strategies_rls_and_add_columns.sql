-- RLS policy javítása a strategies táblán
DROP POLICY IF EXISTS "Users can manage own strategies" ON public.strategies;

CREATE POLICY "Allow all access" ON public.strategies
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.strategies TO anon, authenticated, service_role;

-- Kompatibilis oszlopok hozzáadása
ALTER TABLE public.strategies
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS position_size_pct numeric DEFAULT 2.0;

UPDATE public.strategies SET is_active = true, position_size_pct = max_position_pct WHERE is_active IS NULL OR position_size_pct IS NULL;

-- Teszt stratégiák
INSERT INTO public.strategies (
  name, initial_capital, risk_level, strategy_type,
  max_position_pct, stop_loss_pct, take_profit_pct,
  max_daily_trades, max_open_positions, is_active, position_size_pct
) VALUES
  ('Konzervatív day trade', 10000, 'low', 'day-trading', 2.0, 1.0, 2.0, 5, 3, true, 2.0),
  ('Agresszív day trade', 10000, 'high', 'day-trading', 5.0, 2.0, 4.0, 10, 5, true, 5.0),
  ('Swing trading', 25000, 'medium', 'swing', 3.0, 2.0, 5.0, 3, 2, true, 3.0)
ON CONFLICT DO NOTHING;
