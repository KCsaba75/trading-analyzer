// 2. FÁZIS: Elemzési modul — 10 indikátor szavazás + Jev AI döntés

import { useState } from 'react';
import { type AnalysisResult, type IndicatorVote } from '../../types';
import { Panel, Button, Input, Select, Badge } from '../../components/ui';
import { Search, TrendingUp, TrendingDown, Activity, Brain } from 'lucide-react';

const POPULAR_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'AMZN', 'META', 'SPY', 'QQQ', 'BTC-USD', 'ETH-USD'];

const INDICATOR_NAMES_HU: Record<string, string> = {
  'RSI': 'Relatív Erő Index',
  'MACD': 'Mozgó Átlag Konvergencia Divergencia',
  'MA Cross (9/21)': 'Mozgó Átlag Kereszteződés',
  'Bollinger': 'Bollinger Szalagok',
  'Volume': 'Volumen',
  'Stochastic': 'Stochastic Oszcillátor',
  'ADX': 'Átlagos Irányzék Index',
  'CCI': 'Commodity Channel Index',
  'OBV': 'On-Balance Volume',
  'ATR': 'Átlagos Valós Tartomány',
};

const TIMEFRAMES = [
  { value: '15m', label: '15 perc' },
  { value: '1h', label: '1 óra' },
  { value: '1d', label: '1 nap' },
];

export default function AnalysisModule() {
  const [ticker, setTicker] = useState('AAPL');
  const [timeframe, setTimeframe] = useState('15m');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);

    // 1. Próbáljuk a HELYI YFinance Proxy-t (localhost:8001)
    try {
      const proxyResp = await fetch('http://localhost:8001/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, timeframe }),
      });
      if (proxyResp.ok) {
        const data = await proxyResp.json();
        setResult(data);
        setLoading(false);
        return;
      }
    } catch {
      // Proxy nem fut, megyünk tovább
    }

    // 2. Próbáljuk a Supabase Edge Function-t
    try {
      const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
      const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const resp = await fetch(`${supabaseUrl}/functions/v1/analyze-stock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ ticker, timeframe }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setResult(data);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Supabase sem elérhető
    }

    // 3. Demo adatok
    const demoData = generateDemoAnalysis(ticker, timeframe);
    setResult(demoData);
    setError('A YFinance Proxy (localhost:8001) és a Supabase Edge Function sem elérhető. Indítsd el a YFinance Proxy-t vagy aktiváld a Supabase projektet. Demo adatok jelennek meg.');
    setLoading(false);
  };

  // Demo adatok generálása amíg az Edge Function nem elérhető
  const generateDemoAnalysis = (tkr: string, tf: string): AnalysisResult => {
    const votes: IndicatorVote[] = [
      { name: 'RSI', signal: 'neutral', weight: 0.15, confidence: 0.6, value: '52.3', reason: 'Semleges zóna' },
      { name: 'MACD', signal: 'bullish', weight: 0.15, confidence: 0.75, value: '0.45', reason: 'Hisztogram pozitív' },
      { name: 'MA Cross (9/21)', signal: 'bullish', weight: 0.08, confidence: 0.6, value: '+0.85', reason: 'Rövid távú MA a hosszú felett' },
      { name: 'Bollinger', signal: 'neutral', weight: 0.08, confidence: 0.4, value: '50%', reason: 'Sávok közepén' },
      { name: 'Volume', signal: 'bullish', weight: 0.1, confidence: 0.65, value: '1.3x', reason: 'Átlag feletti volumen, emelkedés' },
      { name: 'Stochastic', signal: 'neutral', weight: 0.08, confidence: 0.5, value: '45', reason: 'Semleges tartomány' },
      { name: 'ADX', signal: 'bullish', weight: 0.08, confidence: 0.7, value: '28', reason: 'Erős felfelé trend' },
      { name: 'CCI', signal: 'neutral', weight: 0.08, confidence: 0.3, value: '15', reason: 'Normál tartomány' },
      { name: 'OBV', signal: 'bullish', weight: 0.1, confidence: 0.65, value: '+1.2M', reason: 'Pénz beáramlás' },
      { name: 'ATR', signal: 'neutral', weight: 0.05, confidence: 0.3, value: '1.85', reason: 'Normál volatilitás' },
    ];
    const bullish = votes.filter(v => v.signal === 'bullish').reduce((a, v) => a + v.weight * v.confidence, 0);
    const bearish = votes.filter(v => v.signal === 'bearish').reduce((a, v) => a + v.weight * v.confidence, 0);
    return {
      ticker: tkr.toUpperCase(),
      timeframe: tf,
      current_price: 195.42,
      votes,
      jev_decision: 'BUY',
      jev_confidence: 0.72,
      jev_reasoning: `Bullish súly: ${bullish.toFixed(2)}, Bearish súly: ${bearish.toFixed(2)}. 6/10 indikátor bullish szavazatot adott, dominál a momentum és a volumen.`,
      weighted_score: parseFloat((bullish - bearish).toFixed(3)),
      analyzed_at: new Date().toISOString(),
    };
  };

  const signalColor = (signal: string) => 
    signal === 'bullish' ? 'bull' : 
    signal === 'bearish' ? 'bear' : 'muted';

  const decisionColor = (decision: string) =>
    decision === 'BUY' ? 'bull' : decision === 'SELL' ? 'bear' : 'warn';

  return (
    <div className="space-y-6">
      <Panel title="🔍 Részvény elemzés">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Részvény ticker"
            value={ticker}
            onChange={(v) => setTicker(v.toUpperCase())}
            placeholder="AAPL"
          />
          <Select
            label="Időkeret"
            value={timeframe}
            onChange={setTimeframe}
            options={TIMEFRAMES}
          />
          <div className="flex items-end">
            <Button onClick={analyze} disabled={loading} variant="primary">
              {loading ? '⏳ Elemzés...' : (
                <>
                  <Search className="inline w-4 h-4 mr-2" />
                  Elemzés indítása
                </>
              )}
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-sm text-[var(--color-muted)]">Gyors választás:</span>
          {POPULAR_TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => setTicker(t)}
              className={`px-3 py-1 rounded text-xs ${
                ticker === t 
                  ? 'bg-[var(--color-accent)] text-black' 
                  : 'bg-[var(--color-border)] hover:opacity-80'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Panel>

      {error && (
        <div className="bg-[var(--color-warn)]/10 border border-[var(--color-warn)] rounded-lg p-4 text-[var(--color-warn)] text-sm">
          ⚠️ {error}
        </div>
      )}

      {result && (
        <>
          <Panel title="📊 Jev AI Döntés">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-[var(--color-muted)]">Részvény</div>
                <div className="text-3xl font-bold">{result.ticker}</div>
                <div className="text-sm text-[var(--color-muted)]">${result.current_price?.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-[var(--color-muted)]">Döntés</div>
                <div className="text-3xl font-bold">
                  <Badge color={decisionColor(result.jev_decision) as any}>
                    {result.jev_decision === 'BUY' && <TrendingUp className="inline w-5 h-5 mr-1" />}
                    {result.jev_decision === 'SELL' && <TrendingDown className="inline w-5 h-5 mr-1" />}
                    {result.jev_decision === 'HOLD' && <Activity className="inline w-5 h-5 mr-1" />}
                    {result.jev_decision}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="text-sm text-[var(--color-muted)]">Konfidencia</div>
                <div className="text-3xl font-bold">{Math.round(result.jev_confidence * 100)}%</div>
                <div className="h-2 bg-[var(--color-border)] rounded mt-1">
                  <div 
                    className={`h-full rounded ${result.jev_decision === 'BUY' ? 'bg-[var(--color-bull)]' : result.jev_decision === 'SELL' ? 'bg-[var(--color-bear)]' : 'bg-[var(--color-warn)]'}`}
                    style={{ width: `${result.jev_confidence * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="text-sm text-[var(--color-muted)]">Súlyozott score</div>
                <div className={`text-3xl font-bold ${result.weighted_score > 0 ? 'text-[var(--color-bull)]' : result.weighted_score < 0 ? 'text-[var(--color-bear)]' : ''}`}>
                  {result.weighted_score > 0 ? '+' : ''}{result.weighted_score}
                </div>
                <div className="text-xs text-[var(--color-muted)]">-1 bearish ... +1 bullish</div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-[var(--color-bg)] rounded-lg">
              <div className="flex items-start gap-2">
                <Brain className="w-5 h-5 text-[var(--color-accent)] mt-1 shrink-0" />
                <div>
                  <div className="text-sm text-[var(--color-muted)] mb-1">Jev AI indoklás</div>
                  <div className="text-sm">{result.jev_reasoning}</div>
                </div>
              </div>
            </div>
          </Panel>

          <Panel title={`🎯 10 indikátor szavazás (${result.votes.length})`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.votes.map((vote, idx) => (
                <div key={idx} className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">{vote.name}</div>
                      <div className="text-xs text-[var(--color-muted)]">{INDICATOR_NAMES_HU[vote.name] || vote.name}</div>
                    </div>
                    <Badge color={signalColor(vote.signal) as any}>
                      {vote.signal === 'bullish' ? '🟢 Bullish' : vote.signal === 'bearish' ? '🔴 Bearish' : '⚪ Neutral'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                    <span>Érték: <span className="text-[var(--color-text)] font-mono">{vote.value}</span></span>
                    <span>·</span>
                    <span>Súly: <span className="text-[var(--color-text)]">{(vote.weight * 100).toFixed(0)}%</span></span>
                    <span>·</span>
                    <span>Konfidencia: <span className="text-[var(--color-text)]">{Math.round(vote.confidence * 100)}%</span></span>
                  </div>
                  <div className="mt-2 text-xs">{vote.reason}</div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}

      {!result && !loading && (
        <Panel title="ℹ️ Hogyan működik?">
          <ol className="space-y-2 text-sm text-[var(--color-muted)]">
            <li>1. Adj meg egy ticker jelet (pl. AAPL, TSLA)</li>
            <li>2. Válassz időkeretet (15m / 1h / 1d)</li>
            <li>3. Az Edge Function meghívja a YFinance API-t és lekéri az elmúlt 7 nap adatait</li>
            <li>4. Kiszámol 10 technikai indikátort (RSI, MACD, MA, Bollinger, Volume, Stochastic, ADX, CCI, OBV, ATR)</li>
            <li>5. Mindegyik indikátor kap egy súlyozott szavazatot (bullish/bearish/neutral)</li>
            <li>6. A <strong>Jev AI</strong> (Requesty endpoint) aggregálja a szavazatokat és kiadja a végső döntést (BUY/SELL/HOLD) + konfidenciát</li>
          </ol>
        </Panel>
      )}
    </div>
  );
}
