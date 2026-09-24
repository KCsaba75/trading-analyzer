-- Positions tábla a nyitott/zárt pozíciók nyilvántartásához
CREATE TABLE IF NOT EXISTS positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ticker text NOT NULL,
  strategy_id uuid REFERENCES strategies(id) ON DELETE SET NULL,
  decision text NOT NULL DEFAULT 'BUY',
  confidence numeric,
  timeframe text DEFAULT '15m',
  entry_price numeric NOT NULL,
  stop_loss numeric,
  take_profit_1 numeric,
  take_profit_2 numeric,
  take_profit_3 numeric,
  position_size numeric,
  risk_reward_ratio numeric,
  status text NOT NULL DEFAULT 'pending',
  opened_at timestamptz,
  closed_at timestamptz,
  close_price numeric,
  pnl numeric,
  reasoning text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access for anon" ON public.positions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT ALL ON public.positions TO anon, authenticated, service_role;
