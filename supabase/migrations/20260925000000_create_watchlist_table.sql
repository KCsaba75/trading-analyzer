
-- Create the watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker text NOT NULL UNIQUE,
  timeframe text NOT NULL DEFAULT '15m',
  is_active boolean DEFAULT true,
  last_alert_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for all users" ON public.watchlist FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users" ON public.watchlist FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON public.watchlist FOR UPDATE TO authenticated WITH CHECK (true);
CREATE POLICY "Enable delete for authenticated users" ON public.watchlist FOR DELETE TO authenticated USING (true);

-- Insert default tickers
INSERT INTO watchlist (ticker, timeframe) VALUES 
  ('AAPL', '15m'), 
  ('MSFT', '15m'), 
  ('TSLA', '15m'), 
  ('NVDA', '15m'), 
  ('AMZN', '15m')
ON CONFLICT (ticker) DO NOTHING;
