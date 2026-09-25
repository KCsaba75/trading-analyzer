// 2. FÁZIS: Elemzési modul — Watchlist-alapú tömeges 15 perces elemzés
// Funkció: Egy gombnyomásra minden watchlist ticker 15m elemzése + "Átrakás a Pozíciók lapra" gombok

import { useState, useEffect } from 'react';
import { type AnalysisResult } from '../../types';
import { Panel, Button, Badge } from '../../components/ui';
import { watchlistApi, positionsApi, supabase } from '../../lib/supabase/client';
import { Play, TrendingUp, TrendingDown, Loader2, CheckCircle2, RefreshCw, Eye, Send } from 'lucide-react';

interface WatchlistItem {
  id: string;
  ticker: string;
  timeframe: string;
  is_active: boolean;
  last_alert_at: string | null;
  created_at: string;
}

interface TickerAnalysis {
  ticker: string;
  timeframe: string;
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
  movedToPending?: boolean;
}

function Stat({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function safeFixed(value: any, digits: number = 2): string {
  if (value == null || value === undefined || isNaN(Number(value))) return 'N/A';
  return Number(value).toFixed(digits);
}

function decisionBadge(decision: string) {
  if (decision === 'BUY') return <Badge color="green"><TrendingUp size={12} className="inline mr-1" />BUY</Badge>;
  if (decision === 'SELL') return <Badge color="red"><TrendingDown size={12} className="inline mr-1" />SELL</Badge>;
  return <Badge color="yellow">HOLD</Badge>;
}

export default function AnalysisModule() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, TickerAnalysis>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [activeStrategies, setActiveStrategies] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Watchlist betöltése
  const loadWatchlist = async () => {
    try {
      const data = await watchlistApi.list();
      setWatchlist(data as WatchlistItem[]);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Aktív stratégiák betöltése
  const loadStrategies = async () => {
    try {
      const { data } = await supabase
        .from('strategies')
        .select('*')
        .eq('is_active', true)
        .order('position_size_pct', { ascending: false });
      setActiveStrategies(data ?? []);
    } catch (e: any) {
      console.error('Failed to load strategies:', e);
    }
  };

  useEffect(() => {
    loadWatchlist();
    loadStrategies();
  }, []);

  // Egy ticker 15m elemzése - Supabase-js kliens invoke (CORS mentes!)
  const analyzeTicker = async (ticker: string, timeframe: string): Promise<AnalysisResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-stock', {
        body: { ticker, timeframe },
      });

      if (error) {
        console.error(`Analyze ${ticker} failed:`, error);
        return null;
      }
      return data as AnalysisResult;
    } catch (e: any) {
      console.error(`Analysis failed for ${ticker}:`, e);
      return null;
    }
  };

  // ÖSSZES watchlist ticker 15m elemzése egy gombnyomásra
  const runBulkAnalysis = async () => {
    if (watchlist.length === 0) {
      alert('A watchlist üres! Adj hozzá tickereket a Figyelőlista lapon.');
      return;
    }

    setBulkLoading(true);
    setError(null);

    const initialState: Record<string, TickerAnalysis> = {};
    for (const item of watchlist) {
      initialState[item.ticker] = {
        ticker: item.ticker,
        timeframe: item.timeframe,
        result: null,
        loading: true,
        error: null,
      };
    }
    setAnalyses(initialState);

    await Promise.all(
      watchlist.map(async (item) => {
        const result = await analyzeTicker(item.ticker, item.timeframe);
        setAnalyses(prev => ({
          ...prev,
          [item.ticker]: {
            ticker: item.ticker,
            timeframe: item.timeframe,
            result: result,
            loading: false,
            error: result ? null : 'Elemzés sikertelen',
          },
        }));
      })
    );

    setBulkLoading(false);
  };

  // Pending pozíció létrehozása (Pozíciók lapra átrakás)
  const moveToPositions = async (ticker: string, analysis: AnalysisResult) => {
    if (!analysis || (analysis.jev_decision !== 'BUY' && analysis.jev_decision !== 'SELL')) {
      alert(`${ticker}: Csak BUY/SELL döntésnél lehet átrakni!`);
      return;
    }

    const strategy = activeStrategies[0];
    if (!strategy) {
      alert('Nincs aktív stratégia! Hozz létre egyet a Stratégia lapon.');
      return;
    }

    try {
      const ts = analysis.trade_setup || {};
      const entry = ts.entry || analysis.current_price;
      const sl = ts.stop_loss || (analysis.jev_decision === 'BUY'
        ? entry * (1 - Number(strategy.stop_loss_pct) / 100)
        : entry * (1 + Number(strategy.stop_loss_pct) / 100));
      const tp1 = ts.take_profit_1 || (analysis.jev_decision === 'BUY'
        ? entry * (1 + Number(strategy.take_profit_pct) * 0.5 / 100)
        : entry * (1 - Number(strategy.take_profit_pct) * 0.5 / 100));
      const tp2 = ts.take_profit_2 || (analysis.jev_decision === 'BUY'
        ? entry * (1 + Number(strategy.take_profit_pct) / 100)
        : entry * (1 - Number(strategy.take_profit_pct) / 100));
      const tp3 = ts.take_profit_3 || (analysis.jev_decision === 'BUY'
        ? entry * (1 + Number(strategy.take_profit_pct) * 2 / 100)
        : entry * (1 - Number(strategy.take_profit_pct) * 2 / 100));
      const rr = Math.abs(tp1 - entry) / Math.abs(entry - sl);
      const positionValue = Number(strategy.initial_capital) * (Number(strategy.position_size_pct) / 100);

      await positionsApi.create({
        ticker,
        strategy_id: strategy.id,
        decision: analysis.jev_decision,
        confidence: analysis.jev_confidence || 0.7,
        timeframe: '15m',
        entry_price: entry,
        stop_loss: sl,
        take_profit_1: tp1,
        take_profit_2: tp2,
        take_profit_3: tp3,
        position_size: positionValue,
        risk_reward_ratio: rr,
        status: 'pending',
        reasoning: `Kézi elemzés az Elemzés lapról — ${analysis.jev_decision} @ $${safeFixed(analysis.current_price)}`,
      });

      setAnalyses(prev => ({
        ...prev,
        [ticker]: { ...prev[ticker], movedToPending: true },
      }));

      alert(`✅ ${ticker} pending pozíció létrehozva!\n\nNézd meg a Pozíciók lapon.`);
    } catch (e: any) {
      alert(`Hiba: ${e.message}`);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Fejléc + bulk futtatás gomb */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-lg md:text-xl font-semibold">Watchlist Elemzés (15m)</h2>
          <p className="text-xs md:text-sm text-[var(--color-muted)]">
            {watchlist.length} ticker a figyelőlistán • {Object.keys(analyses).length} elemezve
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={loadWatchlist} disabled={bulkLoading}>
            <RefreshCw size={14} className="mr-1" />
            Lista frissítése
          </Button>
          <Button onClick={runBulkAnalysis} disabled={bulkLoading || watchlist.length === 0}>
            {bulkLoading ? (
              <Loader2 size={14} className="mr-1 animate-spin" />
            ) : (
              <Play size={14} className="mr-1" />
            )}
            {bulkLoading ? 'Elemzés folyamatban...' : `▶️ Összes elemzése (${watchlist.length})`}
          </Button>
        </div>
      </div>

      {/* Hiba */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Watchlist tickerek táblázata */}
      {watchlist.length === 0 ? (
        <Panel title="Figyelőlista üres">
          <div className="text-center py-8 text-[var(--color-muted)]">
            Adj hozzá tickereket a <strong>3. Figyelőlista</strong> lapon, hogy itt megjelenjenek.
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {watchlist.map(item => {
            const a = analyses[item.ticker];
            const decision = a?.result?.jev_decision;
            const canMove = decision === 'BUY' || decision === 'SELL';

            return (
              <div
                key={item.id}
                className={`bg-[var(--color-panel)] border rounded-lg p-4 ${
                  !item.is_active
                    ? 'border-gray-500/30 opacity-60'
                    : a?.movedToPending
                    ? 'border-green-500/50'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  {/* Ticker info + státusz */}
                  <div className="flex items-center gap-3 flex-1">
                    <Eye size={16} className={item.is_active ? 'text-green-400' : 'text-gray-500'} />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-lg font-mono">{item.ticker}</span>
                        <Badge color="blue">{item.timeframe}</Badge>
                        {!item.is_active && <Badge color="gray">⏸️ Inaktív</Badge>}
                        {a?.movedToPending && <Badge color="green">✅ Pendingbe téve</Badge>}
                      </div>
                      {a?.result && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {decisionBadge(a.result.jev_decision)}
                          <span className="text-xs text-[var(--color-muted)]">
                            Score: <span className={a.result.weighted_score > 0 ? 'text-green-400' : 'text-red-400'}>
                              {safeFixed(a.result.weighted_score, 3)}
                            </span>
                          </span>
                          <span className="text-xs text-[var(--color-muted)]">
                            Konf: {(a.result.jev_confidence * 100).toFixed(0)}%
                          </span>
                          <span className="text-xs text-[var(--color-muted)]">
                            Ár: ${safeFixed(a.result.current_price)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trade setup info */}
                  {a?.result && canMove && (
                    <div className="flex flex-col md:flex-row gap-2 md:gap-4 text-xs">
                      {a.result.trade_setup && (
                        <>
                          <div>
                            <div className="text-[var(--color-muted)]">Entry</div>
                            <div className="font-medium">${safeFixed(a.result.trade_setup.entry, 2)}</div>
                          </div>
                          <div>
                            <div className="text-[var(--color-muted)]">SL</div>
                            <div className="font-medium text-red-400">${safeFixed(a.result.trade_setup.stop_loss, 2)}</div>
                          </div>
                          <div>
                            <div className="text-[var(--color-muted)]">TP1</div>
                            <div className="font-medium text-green-400">${safeFixed(a.result.trade_setup.take_profit_1, 2)}</div>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Akció gomb */}
                  <div className="flex gap-2">
                    {a?.loading && (
                      <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                        <Loader2 size={14} className="animate-spin" />
                        Elemzés...
                      </div>
                    )}
                    {a?.error && !a.loading && (
                      <span className="text-xs text-red-400">❌ {a.error}</span>
                    )}
                    {a?.result && canMove && !a.movedToPending && (
                      <Button
                        onClick={() => moveToPositions(item.ticker, a.result!)}
                        variant="primary"
                        size="sm"
                      >
                        <Send size={14} className="mr-1" />
                        Átrakás a Pozíciók lapra
                      </Button>
                    )}
                    {a?.movedToPending && (
                      <Badge color="green">
                        <CheckCircle2 size={12} className="inline mr-1" />
                        Átadva
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Részletes trade setup (expandable) */}
                {a?.result && a.result.trade_setup && (
                  <details className="mt-3">
                    <summary className="text-xs text-[var(--color-muted)] cursor-pointer hover:text-[var(--color-accent)]">
                      📊 Részletes trade setup + indikátorok
                    </summary>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <Stat label="Entry" value={`$${safeFixed(a.result.trade_setup.entry)}`} />
                      <Stat label="Stop Loss" value={`$${safeFixed(a.result.trade_setup.stop_loss)}`} color="text-red-400" />
                      <Stat label="TP1 (1.5R)" value={`$${safeFixed(a.result.trade_setup.take_profit_1)}`} color="text-green-400" />
                      <Stat label="TP2 (2.5R)" value={`$${safeFixed(a.result.trade_setup.take_profit_2)}`} color="text-green-400" />
                      <Stat label="Hold time" value={a.result.trade_setup.hold_time || 'N/A'} />
                      <Stat label="R:R" value={safeFixed(a.result.risk_reward_ratio, 2)} />
                      <Stat label="Jev Score" value={safeFixed(a.result.jev_confidence, 2)} />
                    </div>
                    {a.result.jev_reasoning && (
                      <div className="mt-3 p-2 bg-[var(--color-bg)] rounded text-xs italic">
                        💭 {a.result.jev_reasoning}
                      </div>
                    )}
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info panel */}
      <Panel title="Hogyan működik?">
        <div className="text-sm text-[var(--color-muted)] space-y-2">
          <p>
            <strong>1.</strong> Kattints a <strong>"▶️ Összes elemzése"</strong> gombra — a rendszer a watchlist <strong>összes aktív</strong> tickerét 15 perces timeframe-en elemzi.
          </p>
          <p>
            <strong>2.</strong> Minden tickernél megjelenik a Jev AI döntés (BUY/SELL/HOLD), score, konfidencia, és az aktuális ár.
          </p>
          <p>
            <strong>3.</strong> Ha van BUY/SELL jel, megjelenik egy <strong>"Átrakás a Pozíciók lapra"</strong> gomb — ez pending pozíciót hoz létre a stratégia beállításaival.
          </p>
          <p>
            <strong>4.</strong> A pending pozíció a 4. Pozíciók lapon jelenik meg, ahol aktiválhatod, frissítheted vagy törölheted.
          </p>
        </div>
      </Panel>
    </div>
  );
}
