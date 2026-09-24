// Supabase Edge Function: analyze-stock
// 2. fázis: 10 indikátor + Jev AI súlyozott szavazás
// YFinance REST API (nincs külső library dependency)
// Futtatás: supabase functions deploy analyze-stock

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { 
  fingerprint, 
  createWindows, 
  findSimilarPatterns, 
  computePatternStats,
  type Fingerprint 
} from './_helpers/pattern.ts';
import { generateTradeSetup, fallbackTradeSetup, type TradeSetup } from './_helpers/tradeSetup.ts';

const YF_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

// === INDIKÁTOR SZÁMÍTÁSOK ===

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  const diffs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    diffs.push(closes[i] - closes[i - 1]);
  }
  const recent = diffs.slice(-period);
  const gains = recent.filter((d) => d > 0).reduce((a, b) => a + b, 0) / period;
  const losses = recent.filter((d) => d < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function macd(closes: number[]): { macd: number; signal: number; histogram: number } {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    const result: number[] = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };
  const fastEMA = ema(closes, 12);
  const slowEMA = ema(closes, 26);
  const macdLine = fastEMA.map((v, i) => v - slowEMA[i]);
  const signalLine = ema(macdLine, 9);
  const i = macdLine.length - 1;
  return { macd: macdLine[i], signal: signalLine[i], histogram: macdLine[i] - signalLine[i] };
}

function bollinger(closes: number[], period = 20) {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
  const recent = closes.slice(-period);
  const mean = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: mean + 2 * sd, middle: mean, lower: mean - 2 * sd };
}

function maCross(closes: number[]): { short: number; long: number; diff: number } {
  const sma = (data: number[], n: number) =>
    data.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, data.length);
  const short = sma(closes, 9);
  const long_ = sma(closes, 21);
  return { short, long: long_, diff: short - long_ };
}

function stochastic(highs: number[], lows: number[], closes: number[], period = 14) {
  if (closes.length < period) return { k: 50, d: 50 };
  const h = Math.max(...highs.slice(-period));
  const l = Math.min(...lows.slice(-period));
  const c = closes[closes.length - 1];
  return { k: h === l ? 50 : ((c - l) / (h - l)) * 100, d: 50 };
}

function volumeSpike(volumes: number[]): number {
  if (volumes.length < 21) return 1;
  const recent = volumes[volumes.length - 1];
  const avg = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  return avg === 0 ? 1 : recent / avg;
}

function obvTrend(closes: number[], volumes: number[]): number {
  if (closes.length < 2) return 0;
  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }
  return obv;
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  if (trs.length < period) return 0;
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function cci(highs: number[], lows: number[], closes: number[], period = 20): number {
  if (closes.length < period) return 0;
  const tps = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const recent = tps.slice(-period);
  const sma = recent.reduce((a, b) => a + b, 0) / period;
  const meanDev = recent.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
  const tp = tps[tps.length - 1];
  return meanDev === 0 ? 0 : (tp - sma) / (0.015 * meanDev);
}

function adxSimple(closes: number[]): number {
  if (closes.length < 14) return 20;
  const diffs = closes.slice(-14).map((v, i, arr) =>
    i > 0 ? Math.abs(v - arr[i - 1]) : 0
  );
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const totalRange = Math.max(...closes.slice(-14)) - Math.min(...closes.slice(-14));
  return totalRange === 0 ? 0 : Math.min(100, (avg / totalRange) * 100 * 5);
}

// === YFINANCE ADATLEKÉRÉS (REST API, nincs library) ===

async function fetchYFinanceData(ticker: string, interval: string): Promise<{
  closes: number[]; highs: number[]; lows: number[]; volumes: number[];
} | null> {
  try {
    const range = ['1m', '5m', '15m', '30m'].includes(interval) ? '60d' : '1y';
    const url = `${YF_BASE_URL}/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; trading-analyzer/1.0)' }
    });
    if (!resp.ok) {
      console.error(`YFinance HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      console.error('YFinance: nincs result');
      return null;
    }

    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const highs = result.indicators?.quote?.[0]?.high ?? [];
    const lows = result.indicators?.quote?.[0]?.low ?? [];
    const volumes = result.indicators?.quote?.[0]?.volume ?? [];

    const clean = { closes: [] as number[], highs: [] as number[], lows: [] as number[], volumes: [] as number[] };
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null && highs[i] != null && lows[i] != null) {
        clean.closes.push(closes[i]);
        clean.highs.push(highs[i]);
        clean.lows.push(lows[i]);
        clean.volumes.push(volumes[i] ?? 0);
      }
    }
    return clean.closes.length >= 30 ? clean : null;
  } catch (e) {
    console.error('YFinance error:', e);
    return null;
  }
}

// === JEV AI INTEGRÁCIÓ ===

interface JevResult {
  decision: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
}

function scoreBasedFallback(score: number): JevResult {
  if (score > 0.3) return { decision: 'BUY', confidence: 0.6, reasoning: 'Score-alapú fallback (Jev nem elérhető)' };
  if (score < -0.3) return { decision: 'SELL', confidence: 0.6, reasoning: 'Score-alapú fallback (Jev nem elérhető)' };
  return { decision: 'HOLD', confidence: 0.5, reasoning: 'Score-alapú fallback (Jev nem elérhető)' };
}

async function jevDecide(bullish: number, bearish: number, tradeSetup: TradeSetup | null = null): Promise<JevResult> {
  const apiKey = Deno.env.get('REQUESTY_API_KEY');
  const score = bullish - bearish;

  if (!apiKey) {
    console.warn('REQUESTY_API_KEY nincs beállítva');
    return scoreBasedFallback(score);
  }

  // Trade setup kontextus hozzáadása a prompt-hoz
  const setupContext = tradeSetup
    ? `\n\nGemini trade setup ajánlás:\n- Entry: $${tradeSetup.entry}\n- Stop-loss: $${tradeSetup.stop_loss}\n- TP1: $${tradeSetup.take_profit_1}\n- TP2: $${tradeSetup.take_profit_2}\n- Hold time: ${tradeSetup.hold_time}\n- Position size: ${tradeSetup.position_size_pct}%\n- Rationale: ${tradeSetup.rationale}`
    : '';

  try {
    const resp = await fetch('https://router.requesty.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'typesafe/jev-1.13.0',
        messages: [{
          role: 'user',
          content: `Bullish=${bullish.toFixed(2)}, Bearish=${bearish.toFixed(2)}, Score=${score.toFixed(2)}. Adj döntést.${setupContext}`,
        }],
        response_format: {
          type: 'questions',
          questions: {
            decision: {
              type: 'choice',
              instructions: 'A 10 technikai indikátor súlyozott szavazása alapján milyen kereskedelmi döntést hozzunk?',
              criteria: {
                BUY: 'Long pozíció nyitása — a súlyozott score bullish és magas a konfidencia',
                SELL: 'Short pozíció vagy long zárás — a score bearish és egyértelmű a jelzés',
                HOLD: 'Várakozás jobb belépési pontra — a score semleges vagy alacsony konfidencia',
              },
            },
          },
        },
        max_tokens: 100,
      }),
    });

    if (!resp.ok) {
      console.error(`Jev HTTP ${resp.status}`);
      return scoreBasedFallback(score);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    let parsed: any;
    try {
      parsed = typeof content === 'string' ? JSON.parse(content) : content;
    } catch {
      parsed = {};
    }
    
    // Új Jev formátum: {decision: {choice: "BUY", confidence: 0.25, probabilities: {...}}}
    // Régi formátum: {answers: {decision: "BUY"}, confidence: 0.6}
    const decision = parsed?.decision?.choice 
      ?? parsed?.answers?.decision 
      ?? 'HOLD';
    const confidence = parsed?.decision?.confidence 
      ?? parsed?.confidence 
      ?? 0.5;
    
    return {
      decision: decision as 'BUY' | 'SELL' | 'HOLD',
      confidence: typeof confidence === 'number' ? confidence : 0.5,
      reasoning: `Jev AI: ${decision} (${confidence.toFixed(2)}) — Bullish: ${bullish.toFixed(2)}, Bearish: ${bearish.toFixed(2)}`,
    };
  } catch (e) {
    console.error('Jev error:', String(e));
    return scoreBasedFallback(score);
  }
}

// === MAIN HANDLER ===



// === HISTORICAL PATTERN ANALYSIS ===

const YAHOO_PATTERN_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

async function fetchHistoricalData(ticker: string): Promise<{
  closes: number[]; highs: number[]; lows: number[]; opens: number[]; volumes: number[];
} | null> {
  try {
    // 60 napos 15m adat = ~2600 adatpont (6.5 órás trading nap × 60 nap)
    // Yfinance limitálja a 60d/15m kombinációt, tehát max 60 nap
    const resp = await fetch(
      `${YAHOO_PATTERN_URL}/${encodeURIComponent(ticker)}?interval=15m&range=60d`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; trading-analyzer/1.0)' } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    
    const ts = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const closes = (quote.close ?? []).filter((v: any) => v != null);
    const highs = (quote.high ?? []).filter((v: any) => v != null);
    const lows = (quote.low ?? []).filter((v: any) => v != null);
    const opens = (quote.open ?? []).filter((v: any) => v != null);
    const volumes = (quote.volume ?? []).filter((v: any) => v != null);
    
    // Közös hosszra igazítás (mert lehet, hogy némelyik rövidebb)
    const len = Math.min(closes.length, highs.length, lows.length, opens.length, volumes.length);
    if (len < 100) return null;
    
    return {
      closes: closes.slice(-len),
      highs: highs.slice(-len),
      lows: lows.slice(-len),
      opens: opens.slice(-len),
      volumes: volumes.slice(-len),
    };
  } catch (e) {
    console.error('Historical data error:', e);
    return null;
  }
}

async function analyzeHistoricalPatterns(
  ticker: string, 
  currentCandles: { closes: number[]; highs: number[]; lows: number[]; volumes: number[] }
): Promise<{
  fingerprint: Fingerprint | null;
  stats: any;
  matches: Array<{
    startIndex: number;
    endIndex: number;
    similarity: number;
    futureReturn5: number;
    futureReturn10: number;
  }>;
  error?: string;
}> {
  try {
    // 1. Jelenlegi helyzet ujjlenyomata (utolsó 30 gyertya)
    const currentSize = Math.min(30, currentCandles.closes.length);
    const currentFp = fingerprint(
      currentCandles.closes.slice(-currentSize),
      currentCandles.highs.slice(-currentSize),
      currentCandles.lows.slice(-currentSize),
      [],  // opens unknown a fast path-ban
      currentCandles.volumes.slice(-currentSize)
    );
    
    // 2. 60 napos history lekérése
    const hist = await fetchHistoricalData(ticker);
    if (!hist || hist.closes.length < 100) {
      return { fingerprint: currentFp, stats: null, matches: [], error: 'Nincs elég historikus adat' };
    }
    
    // 3. Sliding window létrehozása (30-as ablak, 5 lépés)
    // Jelenlegi ablakot kihagyjuk (az utolsó 30 gyertyát)
    const historyCloses = hist.closes.slice(0, -currentSize);
    const historyHighs = hist.highs.slice(0, -currentSize);
    const historyLows = hist.lows.slice(0, -currentSize);
    const historyOpens = hist.opens.slice(0, -currentSize);
    const historyVolumes = hist.volumes.slice(0, -currentSize);
    
    if (historyCloses.length < 30) {
      return { fingerprint: currentFp, stats: null, matches: [], error: 'Kevés historikus adat' };
    }
    
    const windows = createWindows(historyCloses, historyHighs, historyLows, historyOpens, historyVolumes, 30, 5);
    
    if (windows.length === 0) {
      return { fingerprint: currentFp, stats: null, matches: [], error: 'Nincs összehasonlítható ablak' };
    }
    
    // 4. Top 10 hasonló keresése
    const matches = findSimilarPatterns(currentFp, windows, 10);
    
    // 5. Statisztika
    const stats = computePatternStats(matches);
    
    return {
      fingerprint: currentFp,
      stats,
      matches: matches.map((m) => ({
        startIndex: m.window.startIndex,
        endIndex: m.window.endIndex,
        similarity: parseFloat(m.similarity.toFixed(3)),
        futureReturn5: parseFloat((m.futureReturn5 * 100).toFixed(2)),
        futureReturn10: parseFloat((m.futureReturn10 * 100).toFixed(2)),
      })),
    };
  } catch (e) {
    console.error('Pattern analysis error:', String(e));
    return { fingerprint: null, stats: null, matches: [], error: String(e) };
  }
}



serve(async (req) => {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const ticker = (body.ticker || 'AAPL').toUpperCase();
  const interval = body.timeframe || '1d';

  console.log(`Elemzés indítása: ${ticker} (${interval})`);

  // YFinance adatlekérés
  const data = await fetchYFinanceData(ticker, interval);
  if (!data) {
    return new Response(JSON.stringify({ error: 'YFinance: nincs adat vagy hiba' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { closes, highs, lows, volumes } = data;
  const currentPrice = closes[closes.length - 1];

  // === 10 INDIKÁTOR SZAVAZÁS ===
  const votes = [];

  // 1. RSI
  const rsiVal = rsi(closes);
  votes.push({
    name: 'RSI',
    signal: rsiVal < 30 ? 'bullish' : rsiVal > 70 ? 'bearish' : 'neutral',
    weight: 0.15,
    confidence: Math.abs(50 - rsiVal) / 50,
    value: parseFloat(rsiVal.toFixed(1)),
    reason: rsiVal < 30 ? 'Túladott zóna' : rsiVal > 70 ? 'Túlvett zóna' : 'Semleges zóna',
  });

  // 2. MACD
  const macdVal = macd(closes);
  votes.push({
    name: 'MACD',
    signal: macdVal.histogram > 0 ? 'bullish' : 'bearish',
    weight: 0.15,
    confidence: Math.min(1, Math.abs(macdVal.histogram) / (currentPrice * 0.01)),
    value: parseFloat(macdVal.histogram.toFixed(4)),
    reason: macdVal.histogram > 0 ? 'Hisztogram pozitív' : 'Hisztogram negatív',
  });

  // 3. MA Cross
  const ma = maCross(closes);
  votes.push({
    name: 'MA Cross (9/21)',
    signal: ma.diff > 0 ? 'bullish' : 'bearish',
    weight: 0.08,
    confidence: Math.min(1, Math.abs(ma.diff) / (currentPrice * 0.005)),
    value: parseFloat(ma.diff.toFixed(2)),
    reason: ma.diff > 0 ? 'MA9 a MA21 felett' : 'MA9 a MA21 alatt',
  });

  // 4. Bollinger
  const bb = bollinger(closes);
  const bbPos = bb.upper === bb.lower ? 0.5 : (currentPrice - bb.lower) / (bb.upper - bb.lower);
  votes.push({
    name: 'Bollinger',
    signal: currentPrice < bb.lower ? 'bullish' : currentPrice > bb.upper ? 'bearish' : 'neutral',
    weight: 0.08,
    confidence: Math.max(0, Math.abs(0.5 - bbPos) * 2),
    value: `${(bbPos * 100).toFixed(0)}%`,
    reason: currentPrice < bb.lower ? 'Alsó sáv alatt' : currentPrice > bb.upper ? 'Felső sáv felett' : 'Sávok közepén',
  });

  // 5. Volume
  const vs = volumeSpike(volumes);
  const trendUp = closes[closes.length - 1] > closes[closes.length - 5];
  votes.push({
    name: 'Volume',
    signal: vs > 1.5 ? (trendUp ? 'bullish' : 'bearish') : 'neutral',
    weight: 0.1,
    confidence: Math.min(1, (vs - 1) / 2),
    value: `${vs.toFixed(2)}x`,
    reason: vs > 1.5 ? `Volumen ${vs.toFixed(2)}x (${trendUp ? 'rally' : 'dump'})` : 'Normál volumen',
  });

  // 6. Stochastic
  const stoch = stochastic(highs, lows, closes);
  votes.push({
    name: 'Stochastic',
    signal: stoch.k < 20 ? 'bullish' : stoch.k > 80 ? 'bearish' : 'neutral',
    weight: 0.08,
    confidence: Math.abs(50 - stoch.k) / 50,
    value: parseFloat(stoch.k.toFixed(1)),
    reason: stoch.k < 20 ? 'Túladott' : stoch.k > 80 ? 'Túlvett' : 'Semleges',
  });

  // 7. ADX
  const adxVal = adxSimple(closes);
  votes.push({
    name: 'ADX',
    signal: adxVal > 25 ? (trendUp ? 'bullish' : 'bearish') : 'neutral',
    weight: 0.08,
    confidence: Math.min(1, adxVal / 50),
    value: parseFloat(adxVal.toFixed(1)),
    reason: adxVal > 25 ? `Erős trend (${adxVal.toFixed(0)})` : 'Gyenge trend',
  });

  // 8. CCI
  const cciVal = cci(highs, lows, closes);
  votes.push({
    name: 'CCI',
    signal: cciVal < -100 ? 'bullish' : cciVal > 100 ? 'bearish' : 'neutral',
    weight: 0.08,
    confidence: Math.min(1, Math.abs(cciVal) / 200),
    value: parseFloat(cciVal.toFixed(1)),
    reason: cciVal < -100 ? 'Túladott' : cciVal > 100 ? 'Túlvett' : 'Semleges',
  });

  // 9. OBV
  const obvVal = obvTrend(closes, volumes);
  votes.push({
    name: 'OBV',
    signal: obvVal > 0 ? 'bullish' : obvVal < 0 ? 'bearish' : 'neutral',
    weight: 0.1,
    confidence: 0.5,
    value: obvVal >= 0 ? `+${Math.abs(obvVal).toLocaleString()}` : `-${Math.abs(obvVal).toLocaleString()}`,
    reason: obvVal > 0 ? 'Pénz beáramlás' : 'Pénz kiáramlás',
  });

  // 10. ATR
  const atrVal = atr(highs, lows, closes);
  votes.push({
    name: 'ATR',
    signal: 'neutral',
    weight: 0.05,
    confidence: 0.3,
    value: parseFloat(atrVal.toFixed(2)),
    reason: `Volatilitás: ${atrVal.toFixed(2)}`,
  });

  // Sülyozott score
  let bullish = 0, bearish = 0;
  for (const v of votes) {
    const w = v.weight * v.confidence;
    if (v.signal === 'bullish') bullish += w;
    if (v.signal === 'bearish') bearish += w;
  }
  const weightedScore = bullish - bearish;

  // Historical pattern elemzés (60 nap 15m history)
  const patternAnalysis = await analyzeHistoricalPatterns(ticker, { closes, highs, lows, volumes });

  // Trade setup generálás (Gemini 2.5 Flash a FreeLLMAPI-n, ingyenes)
  // Jev csak a BUY/SELL/HOLD döntést hozza, a trade setup külön LLM
  let tradeSetup: TradeSetup | null = null;
  if (weightedScore > 0.05 || weightedScore < -0.05) {
    try {
      tradeSetup = await generateTradeSetup(
        ticker,
        weightedScore,
        votes,
        patternAnalysis.stats ?? { total: 0, bullish: 0, bearish: 0, neutral: 0, avgReturn5: 0, avgReturn10: 0, bestCase5: 0, bestCase10: 0, worstCase5: 0, bestMatchSimilarity: 0 },
        parseFloat(currentPrice.toFixed(2)),
        parseFloat(atrVal.toFixed(2))
      );
      if (!tradeSetup) {
        console.warn('Trade setup null, fallback használata');
        tradeSetup = fallbackTradeSetup(weightedScore, currentPrice, atrVal, weightedScore > 0 ? 'BUY' : 'SELL');
      }
    } catch (e) {
      console.error('Trade setup hiba:', String(e));
    }
  }

  // Jev AI döntés (mostantól trade setup kontextussal)
  const jev = await jevDecide(bullish, bearish, tradeSetup);

  const result = {
    ticker,
    timeframe: interval,
    current_price: parseFloat(currentPrice.toFixed(2)),
    votes,
    weighted_score: parseFloat(weightedScore.toFixed(3)),
    jev_decision: jev.decision,
    jev_confidence: jev.confidence,
    jev_reasoning: jev.reasoning,
    atr: parseFloat(atrVal.toFixed(2)),
    pattern_stats: patternAnalysis.stats,
    pattern_matches: patternAnalysis.matches,
    trade_setup: tradeSetup,
    analyzed_at: new Date().toISOString(),
  };

  console.log(`✓ Kész: ${result.ticker} @ ${result.current_price} → ${result.jev_decision} (${result.jev_confidence.toFixed(2)})`);

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});
