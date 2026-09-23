// Supabase Edge Function: analyze-stock
// 2. fázis: 10 indikátor + Jev AI súlyozott szavazás
// Futtatás: supabase functions deploy analyze-stock

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import yahooFinance from 'npm:yahoo-finance2';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Indikátor számítások (egyszerűsített verziók)
const RSI_PERIOD = 14;
const MACD_FAST = 12, MACD_SLOW = 26, MACD_SIGNAL = 9;
const BB_PERIOD = 20;
const STOCH_K = 14, STOCH_D = 3;
const ADX_PERIOD = 14;
const ATR_PERIOD = 14;
const CCI_PERIOD = 20;

interface IndicatorVote {
  name: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  weight: number;
  confidence: number;
  value: number | string;
  reason: string;
}

// === INDIKÁTOR SZÁMÍTÁSOK ===

function rsi(closes: number[], period = RSI_PERIOD): number {
  if (closes.length < period + 1) return 50;
  const gains: number[] = [], losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(Math.max(diff, 0));
    losses.push(Math.max(-diff, 0));
  }
  const recent = closes.slice(-period - 1);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < recent.length; i++) {
    const diff = recent[i] - recent[i - 1];
    avgGain += Math.max(diff, 0);
    avgLoss += Math.max(-diff, 0);
  }
  avgGain /= period;
  avgLoss /= period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(closes: number[]): { macd: number; signal: number; histogram: number } {
  const ema = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    let e = data[0];
    return data.map((v) => (e = v * k + e * (1 - k)));
  };
  if (closes.length < MACD_SLOW) return { macd: 0, signal: 0, histogram: 0 };
  const fastEMA = ema(closes, MACD_FAST);
  const slowEMA = ema(closes, MACD_SLOW);
  const macdLine = fastEMA.map((v, i) => v - slowEMA[i]);
  const signalLine = ema(macdLine, MACD_SIGNAL);
  const i = macdLine.length - 1;
  const histogram = macdLine[i] - signalLine[i];
  return { macd: macdLine[i], signal: signalLine[i], histogram };
}

function bollinger(closes: number[], period = BB_PERIOD) {
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
  const recent = closes.slice(-period);
  const mean = recent.reduce((a, b) => a + b, 0) / period;
  const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return { upper: mean + 2 * sd, middle: mean, lower: mean - 2 * sd };
}

function maCross(closes: number[]): { short: number; long: number; diff: number } {
  const sma = (data: number[], n: number) => data.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, data.length);
  const short = sma(closes, 9);
  const long = sma(closes, 21);
  return { short, long, diff: short - long };
}

function stochastic(highs: number[], lows: number[], closes: number[], period = STOCH_K) {
  if (closes.length < period) return { k: 50, d: 50 };
  const h = Math.max(...highs.slice(-period));
  const l = Math.min(...lows.slice(-period));
  const c = closes[closes.length - 1];
  const k = ((c - l) / (h - l)) * 100;
  return { k, d: k }; // egyszerűsített
}

function volumeSpike(volumes: number[]): number {
  if (volumes.length < 20) return 1;
  const recent = volumes[volumes.length - 1];
  const avg = volumes.slice(-20, -1).reduce((a, b) => a + b, 0) / 19;
  return avg === 0 ? 1 : recent / avg;
}

function obv(closes: number[], volumes: number[]): number {
  let obv = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
  }
  return obv;
}

function atr(highs: number[], lows: number[], closes: number[], period = ATR_PERIOD): number {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function cci(highs: number[], lows: number[], closes: number[], period = CCI_PERIOD): number {
  const tps = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  if (tps.length < period) return 0;
  const recent = tps.slice(-period);
  const sma = recent.reduce((a, b) => a + b, 0) / period;
  const meanDev = recent.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
  const tp = tps[tps.length - 1];
  return meanDev === 0 ? 0 : (tp - sma) / (0.015 * meanDev);
}

// ADX egyszerűsített - trend erősség
function adx(closes: number[]): number {
  if (closes.length < 14) return 20;
  const diffs = closes.slice(-14).map((v, i, arr) => i > 0 ? Math.abs(v - arr[i - 1]) : 0);
  const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const totalRange = Math.max(...closes.slice(-14)) - Math.min(...closes.slice(-14));
  return totalRange === 0 ? 0 : Math.min(100, (avg / totalRange) * 100 * 5);
}

// === JEV AI INTEGRÁCIÓ ===
async function jevDecide(votes: IndicatorVote[]): Promise<{ decision: 'BUY' | 'SELL' | 'HOLD'; confidence: number; reasoning: string }> {
  const apiKey = Deno.env.get('REQUESTY_API_KEY');
  if (!apiKey) return { decision: 'HOLD', confidence: 0.5, reasoning: 'Jev API key nincs beállítva' };

  // Súlyozott score
  let bullish = 0, bearish = 0;
  for (const v of votes) {
    const weight = v.weight * v.confidence;
    if (v.signal === 'bullish') bullish += weight;
    if (v.signal === 'bearish') bearish += weight;
  }
  const score = bullish - bearish;

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
          content: `10 indikátor szavazás eredménye. Bullish súly: ${bullish.toFixed(2)}, Bearish súly: ${bearish.toFixed(2)}, Score: ${score.toFixed(2)} (-1.0 erős bearish, +1.0 erős bullish). Adj döntést és konfidenciát 0-1 között.`,
        }],
        response_format: {
          type: 'questions',
          questions: {
            decision: {
              type: 'choice',
              options: ['BUY', 'SELL', 'HOLD'],
              criteria: ['Long pozíció nyitása', 'Short vagy long zárás', 'Várakozás jobb belépési pontra'],
            },
          },
        },
        max_tokens: 200,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Jev API error: ${resp.status} ${text}`);
    }

    const data = await resp.json();
    // Jev válasz formátum: { answers: { decision: ... }, confidence: ... }
    const answer = data.choices?.[0]?.message?.content;
    let parsed;
    try {
      parsed = JSON.parse(answer);
    } catch {
      parsed = { answers: { decision: 'HOLD' }, confidence: 0.5 };
    }
    return {
      decision: parsed.answers?.decision ?? 'HOLD',
      confidence: parsed.confidence ?? 0.5,
      reasoning: `Bullish: ${bullish.toFixed(2)}, Bearish: ${bearish.toFixed(2)}`,
    };
  } catch (e) {
    console.error('Jev hiba:', e);
    // Fallback: score alapján döntünk
    if (score > 0.3) return { decision: 'BUY', confidence: 0.6, reasoning: 'Score-alapú fallback döntés (Jev nem elérhető)' };
    if (score < -0.3) return { decision: 'SELL', confidence: 0.6, reasoning: 'Score-alapú fallback döntés (Jev nem elérhető)' };
    return { decision: 'HOLD', confidence: 0.5, reasoning: 'Score-alapú fallback (Jev nem elérhető)' };
  }
}

// === MAIN HANDLER ===
serve(async (req) => {
  const { ticker = 'AAPL', timeframe = '15m' } = await req.json().catch(() => ({}));

  try {
    // YFinance adatlekérés
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // 7 nap 15m-es adat

    const data: any[] = await yahooFinance.historical(ticker, {
      period1: startDate,
      period2: endDate,
      interval: timeframe as any,
    });

    if (!data || data.length < 30) {
      return new Response(JSON.stringify({ error: 'Nincs elég adat' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const closes = data.map((d) => d.close);
    const highs = data.map((d) => d.high);
    const lows = data.map((d) => d.low);
    const volumes = data.map((d) => d.volume ?? 0);
    const currentPrice = closes[closes.length - 1];

    // === 10 INDIKÁTOR SZAVAZÁS ===
    const votes: IndicatorVote[] = [];

    // 1. RSI
    const rsiVal = rsi(closes);
    votes.push({
      name: 'RSI',
      signal: rsiVal < 30 ? 'bullish' : rsiVal > 70 ? 'bearish' : 'neutral',
      weight: 0.15,
      confidence: Math.abs(50 - rsiVal) / 50,
      value: rsiVal.toFixed(1),
      reason: rsiVal < 30 ? 'Túladott zóna' : rsiVal > 70 ? 'Túlvett zóna' : 'Semleges zóna',
    });

    // 2. MACD
    const macdVal = macd(closes);
    votes.push({
      name: 'MACD',
      signal: macdVal.histogram > 0 ? 'bullish' : 'bearish',
      weight: 0.15,
      confidence: Math.min(1, Math.abs(macdVal.histogram) / (currentPrice * 0.01)),
      value: macdVal.histogram.toFixed(4),
      reason: macdVal.histogram > 0 ? 'Hisztogram pozitív (momentum felfelé)' : 'Hisztogram negatív (momentum lefelé)',
    });

    // 3. MA Cross (9/21)
    const ma = maCross(closes);
    votes.push({
      name: 'MA Cross (9/21)',
      signal: ma.diff > 0 ? 'bullish' : 'bearish',
      weight: 0.08,
      confidence: Math.min(1, Math.abs(ma.diff) / (currentPrice * 0.005)),
      value: ma.diff.toFixed(2),
      reason: ma.diff > 0 ? 'Rövid távú MA a hosszú felett' : 'Rövid távú MA a hosszú alatt',
    });

    // 4. Bollinger Bands
    const bb = bollinger(closes);
    const bbPos = (currentPrice - bb.lower) / (bb.upper - bb.lower);
    votes.push({
      name: 'Bollinger',
      signal: currentPrice < bb.lower ? 'bullish' : currentPrice > bb.upper ? 'bearish' : 'neutral',
      weight: 0.08,
      confidence: Math.max(0, Math.abs(0.5 - bbPos) * 2),
      value: `${(bbPos * 100).toFixed(0)}%`,
      reason: currentPrice < bb.lower ? 'Alsó sáv alatt' : currentPrice > bb.upper ? 'Felső sáv felett' : 'Sávok közepén',
    });

    // 5. Volume spike
    const vs = volumeSpike(volumes);
    const trendUp = closes[closes.length - 1] > closes[closes.length - 5];
    votes.push({
      name: 'Volume',
      signal: vs > 1.5 ? (trendUp ? 'bullish' : 'bearish') : 'neutral',
      weight: 0.1,
      confidence: Math.min(1, (vs - 1) / 2),
      value: `${vs.toFixed(2)}x`,
      reason: vs > 1.5 ? `Átlag ${vs.toFixed(2)}-szörös (${trendUp ? 'rally' : 'dump'})` : 'Normál volumen',
    });

    // 6. Stochastic
    const stoch = stochastic(highs, lows, closes);
    votes.push({
      name: 'Stochastic',
      signal: stoch.k < 20 ? 'bullish' : stoch.k > 80 ? 'bearish' : 'neutral',
      weight: 0.08,
      confidence: Math.abs(50 - stoch.k) / 50,
      value: stoch.k.toFixed(1),
      reason: stoch.k < 20 ? 'Túladott' : stoch.k > 80 ? 'Túlvett' : 'Semleges',
    });

    // 7. ADX (trend erősség)
    const adxVal = adx(closes);
    votes.push({
      name: 'ADX',
      signal: adxVal > 25 ? (trendUp ? 'bullish' : 'bearish') : 'neutral',
      weight: 0.08,
      confidence: Math.min(1, adxVal / 50),
      value: adxVal.toFixed(1),
      reason: adxVal > 25 ? `Erős trend (${adxVal.toFixed(0)})` : 'Gyenge trend',
    });

    // 8. CCI
    const cciVal = cci(highs, lows, closes);
    votes.push({
      name: 'CCI',
      signal: cciVal < -100 ? 'bullish' : cciVal > 100 ? 'bearish' : 'neutral',
      weight: 0.08,
      confidence: Math.min(1, Math.abs(cciVal) / 200),
      value: cciVal.toFixed(1),
      reason: cciVal < -100 ? 'Túladott zóna' : cciVal > 100 ? 'Túlvett zóna' : 'Semleges',
    });

    // 9. OBV trend
    const obvVals: number[] = [];
    for (let i = 20; i <= closes.length; i++) {
      obvVals.push(obv(closes.slice(0, i), volumes.slice(0, i)));
    }
    const obvTrend = obvVals[obvVals.length - 1] - obvVals[obvVals.length - 10];
    votes.push({
      name: 'OBV',
      signal: obvTrend > 0 ? 'bullish' : obvTrend < 0 ? 'bearish' : 'neutral',
      weight: 0.1,
      confidence: Math.min(1, Math.abs(obvTrend) / (volumes.reduce((a, b) => a + b, 0) / 10)),
      value: obvTrend > 0 ? `+${obvTrend}` : `${obvTrend}`,
      reason: obvTrend > 0 ? 'Pénz beáramlás' : 'Pénz kiáramlás',
    });

    // 10. ATR (volatilitás - itt inkább neutral)
    const atrVal = atr(highs, lows, closes);
    votes.push({
      name: 'ATR',
      signal: 'neutral',
      weight: 0.05,
      confidence: 0.3,
      value: atrVal.toFixed(2),
      reason: `Volatilitás: ${atrVal.toFixed(2)}`,
    });

    // Sülyozott score
    let weightedScore = 0;
    for (const v of votes) {
      const sign = v.signal === 'bullish' ? 1 : v.signal === 'bearish' ? -1 : 0;
      weightedScore += sign * v.weight * v.confidence;
    }

    // Jev AI döntés
    const jev = await jevDecide(votes);

    const result = {
      ticker,
      timeframe,
      current_price: currentPrice,
      votes,
      weighted_score: parseFloat(weightedScore.toFixed(3)),
      jev_decision: jev.decision,
      jev_confidence: jev.confidence,
      jev_reasoning: jev.reasoning,
      analyzed_at: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
