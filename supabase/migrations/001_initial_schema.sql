-- Trading Analyzer - Supabase séma
-- Futtatás: supabase db reset (vagy psql -f ezen fájl)

-- =========================================================
-- STRATEGIES tábla (1. fázis)
-- =========================================================
create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  initial_capital numeric not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  strategy_type text not null check (strategy_type in ('day-trading', 'swing', 'long-term')),
  max_position_pct numeric not null,
  stop_loss_pct numeric not null,
  take_profit_pct numeric not null,
  max_daily_trades int not null default 5,
  max_open_positions int not null default 5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS: csak a saját stratégiáit látja
alter table public.strategies enable row level security;
create policy "Users can manage own strategies" on public.strategies
  for all using (auth.uid() = user_id);

-- =========================================================
-- ANALYSES tábla (2. fázis)
-- =========================================================
create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  timeframe text not null,
  current_price numeric not null,
  votes jsonb not null,           -- IndicatorVote[] tömb
  weighted_score numeric not null,
  jev_decision text not null check (jev_decision in ('BUY', 'SELL', 'HOLD')),
  jev_confidence numeric not null,
  jev_reasoning text,
  created_at timestamptz default now()
);
alter table public.analyses enable row level security;
create policy "Users can view own analyses" on public.analyses
  for all using (auth.uid() = user_id);

-- =========================================================
-- ENTRY_POINTS tábla (3. fázis)
-- =========================================================
create table public.entry_points (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid references public.analyses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  entry_price numeric not null,
  stop_loss numeric not null,
  take_profit_1 numeric not null,
  take_profit_2 numeric,
  take_profit_3 numeric,
  position_size_usd numeric not null,
  risk_reward_ratio numeric not null,
  valid_until timestamptz not null,
  reasoning text,
  status text default 'pending' check (status in ('pending', 'active', 'filled', 'expired', 'cancelled')),
  created_at timestamptz default now()
);
alter table public.entry_points enable row level security;
create policy "Users can manage own entry points" on public.entry_points
  for all using (auth.uid() = user_id);

-- =========================================================
-- Indexek
-- =========================================================
create index idx_strategies_user on public.strategies(user_id);
create index idx_analyses_user_ticker on public.analyses(user_id, ticker, created_at desc);
create index idx_entry_points_user on public.entry_points(user_id, created_at desc);
