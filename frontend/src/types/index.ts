// Trading Analyzer - Központi típusdefiníciók

export type RiskLevel = 'low' | 'medium' | 'high';
export type StrategyType = 'day-trading' | 'swing' | 'long-term';

export interface StrategyConfig {
  id?: string;
  user_id?: string;
  name: string;
  initial_capital: number;     // USD
  risk_level: RiskLevel;
  strategy_type: StrategyType;
  max_position_pct: number;    // Max pozíció méret a tőke %-ában
  stop_loss_pct: number;       // Stop-loss %
  take_profit_pct: number;     // Take-profit %
  max_daily_trades: number;
  max_open_positions: number;
  created_at?: string;
  updated_at?: string;
}

// 10 technikai indikátor
export interface IndicatorVote {
  name: string;                // 'RSI' | 'MACD' | stb.
  signal: 'bullish' | 'bearish' | 'neutral';
  weight: number;              // Súly (0-1)
  confidence: number;          // 0-1
  value: number | string;      // Aktuális érték
  reason: string;              // Miért ezt a jelet adta
}

export interface PatternStats {
  total: number;
  bullish: number;
  bearish: number;
  neutral: number;
  avgReturn5: number;
  avgReturn10: number;
  bestCase5: number;
  bestCase10: number;
  worstCase5: number;
  bestMatchSimilarity: number;
}

export interface PatternMatch {
  startIndex: number;
  endIndex: number;
  similarity: number;
  futureReturn5: number;
  futureReturn10: number;
}

export interface TradeSetup {
  entry: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2: number;
  hold_time: string;
  rationale: string;
  narrative: string;
  risk_reward_ratio: number;
  position_size_pct: number;
}

export interface AnalysisResult {
  id?: string;
  ticker: string;
  timeframe: string;
  current_price: number;
  votes: IndicatorVote[];
  jev_decision: 'BUY' | 'SELL' | 'HOLD';
  jev_confidence: number;
  jev_reasoning: string;
  weighted_score: number;
  atr?: number;
  pattern_stats?: PatternStats | null;
  pattern_matches?: PatternMatch[];
  trade_setup?: TradeSetup | null;
  analyzed_at: string;
}

export interface EntryPoint {
  id?: string;
  analysis_id: string;
  ticker: string;
  entry_price: number;
  stop_loss: number;
  take_profit_1: number;
  take_profit_2?: number;
  take_profit_3?: number;
  position_size_usd: number;
  risk_reward_ratio: number;
  valid_until: string;         // Érvényességi idő
  reasoning: string;
  created_at?: string;
}

export interface PortfolioSnapshot {
  cash_usd: number;
  positions: OpenPosition[];
  total_value: number;
  daily_pnl: number;
  daily_pnl_pct: number;
}

export interface OpenPosition {
  ticker: string;
  entry_price: number;
  current_price: number;
  quantity: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
}
