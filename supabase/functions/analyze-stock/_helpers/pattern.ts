// _helpers/fingerprint.ts
// Idősor ujjlenyomat (fingerprint) számítás és hasonlóság keresés
// Ezzel a 15m-es history-ban megkeressük a jelenlegi helyzethez leginkább hasonló ablakokat

// === ALAP INDUKÁTOR SZÁMÍTÁSOK ===

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / (arr.length - 1));
}

function rsiOf(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = Math.max(1, closes.length - period); i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  gains /= period;
  losses /= period;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function macdHistOf(closes: number[]): number {
  if (closes.length < 26) return 0;
  const ema = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    let e = data[0];
    return data.map((v) => (e = v * k + e * (1 - k)));
  };
  const macdLine = ema(closes, 12).map((v, i) => v - ema(closes, 26)[i]);
  const signalLine = ema(macdLine, 9);
  return macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
}

// === FINGERPRINT (8-dimenziós jellemző vektor) ===

export interface Fingerprint {
  trend: number;          // (lastClose - firstClose) / firstClose
  volatility: number;     // stddev of %returns
  avgRsi: number;         // 0-100
  macdSign: number;       // -1, 0, +1
  volumeRatio: number;    // max(vol) / mean(vol) - volume kiemelkedés
  bodyRatio: number;      // mean(|body|/(high-low))
  upperWickRatio: number; // mean((high-max(close,open))/(high-low))
  lowerWickRatio: number; // mean((min(close,open)-low)/(high-low))
}

export interface WindowData {
  closes: number[];
  highs: number[];
  lows: number[];
  opens: number[];
  volumes: number[];
  startIndex: number;     // eredeti tömbben hol kezdődik
  endIndex: number;
  fingerprint: Fingerprint;
  futureReturn5: number;  // 30 (5h) gyertyával későbbi close / mostani close - 1
  futureReturn10: number; // 60 (10h) gyertyával későbbi close / mostani close - 1
}

export function fingerprint(closes: number[], highs: number[], lows: number[], opens: number[], volumes: number[]): Fingerprint {
  // 1. trend: az első és utolsó close változása
  const trend = closes.length > 1
    ? (closes[closes.length - 1] - closes[0]) / closes[0]
    : 0;

  // 2. volatility: a záróárak %-változásainak stddev-je
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] !== 0) {
      returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
    }
  }
  const volatility = stddev(returns);

  // 3. avgRsi: 14-es RSI az egész ablakra (egy átlagos érték)
  const avgRsi = rsiOf(closes, 14);

  // 4. macdSign: a MACD hisztogram előjele (-1, 0, +1)
  const macdHist = macdHistOf(closes);
  const macdSign = macdHist > 0.001 ? 1 : (macdHist < -0.001 ? -1 : 0);

  // 5. volumeRatio: max volume / mean volume
  const meanVol = mean(volumes);
  const volumeRatio = meanVol > 0 ? Math.max(...volumes) / meanVol : 1;

  // 6. bodyRatio: test/resistance átlag (test méret / teljes méret)
  let bodySum = 0, rangeSum = 0;
  for (let i = 0; i < closes.length; i++) {
    const body = Math.abs(closes[i] - opens[i]);
    const range = highs[i] - lows[i];
    bodySum += body;
    rangeSum += range;
  }
  const bodyRatio = rangeSum > 0 ? bodySum / rangeSum : 0.5;

  // 7. upperWickRatio: (high - max(open, close)) / (high - low)
  let upperWickSum = 0, lowerWickSum = 0;
  for (let i = 0; i < closes.length; i++) {
    const range = highs[i] - lows[i];
    if (range <= 0) continue;
    const top = Math.max(opens[i], closes[i]);
    const bottom = Math.min(opens[i], closes[i]);
    upperWickSum += (highs[i] - top) / range;
    lowerWickSum += (bottom - lows[i]) / range;
  }
  const upperWickRatio = closes.length > 0 ? upperWickSum / closes.length : 0.3;
  const lowerWickRatio = closes.length > 0 ? lowerWickSum / closes.length : 0.3;

  return {
    trend,
    volatility,
    avgRsi,
    macdSign,
    volumeRatio,
    bodyRatio,
    upperWickRatio,
    lowerWickRatio,
  };
}

// === SLIDING WINDOW ===

export function createWindows(
  closes: number[],
  highs: number[],
  lows: number[],
  opens: number[],
  volumes: number[],
  windowSize = 30,
  step = 5
): WindowData[] {
  const windows: WindowData[] = [];
  for (let start = 0; start + windowSize + 10 < closes.length; start += step) {
    const c = closes.slice(start, start + windowSize);
    const h = highs.slice(start, start + windowSize);
    const l = lows.slice(start, start + windowSize);
    const o = opens.slice(start, start + windowSize);
    const v = volumes.slice(start, start + windowSize);
    
    const fp = fingerprint(c, h, l, o, v);
    
    // Jövőbeli hozam kiszámítása (5 óra = 30 gyertya 15m-on, fallback 10% eltolt)
    const future5 = start + windowSize + 30 < closes.length
      ? (closes[start + windowSize + 30] - closes[start + windowSize - 1]) / closes[start + windowSize - 1]
      : (closes[closes.length - 1] - closes[start + windowSize - 1]) / closes[start + windowSize - 1];
    
    const future10 = start + windowSize + 60 < closes.length
      ? (closes[start + windowSize + 60] - closes[start + windowSize - 1]) / closes[start + windowSize - 1]
      : (closes[closes.length - 1] - closes[start + windowSize - 1]) / closes[start + windowSize - 1];
    
    windows.push({
      closes: c,
      highs: h,
      lows: l,
      opens: o,
      volumes: v,
      startIndex: start,
      endIndex: start + windowSize,
      fingerprint: fp,
      futureReturn5: future5,
      futureReturn10: future10,
    });
  }
  return windows;
}

// === COSINE SIMILARITY ===

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function fpToVector(fp: Fingerprint): number[] {
  // A fingerprintet normalizáljuk, hogy minden dimenzió hasonló súllyal essen latba
  // trend és volatility: 0-0.05 közé normalizálva
  // RSI: 0-100 → 0-1
  // macdSign: -1, 0, +1 (már normalizált)
  // volumeRatio: 1-5+ → 0-1 (1/(1+x) transzform)
  // bodyRatio, wick ratios: 0-1
  return [
    (fp.trend + 0.1) / 0.2,               // -10% ... +10% → 0 ... 1
    Math.min(1, fp.volatility / 0.05),    // 0-5% volatilitás → 0-1
    fp.avgRsi / 100,                       // 0-100 → 0-1
    (fp.macdSign + 1) / 2,                // -1, 0, 1 → 0, 0.5, 1
    1 - 1 / (1 + fp.volumeRatio),         // magasabb jobb, de csökkenő mértékben
    fp.bodyRatio,
    fp.upperWickRatio,
    fp.lowerWickRatio,
  ];
}

// === SIMILARITY SEARCH ===

export interface PatternMatch {
  window: WindowData;
  similarity: number;
  futureReturn5: number;
  futureReturn10: number;
}

export function findSimilarPatterns(
  currentFp: Fingerprint,
  history: WindowData[],
  topK = 10
): PatternMatch[] {
  const currentVector = fpToVector(currentFp);
  
  const matches: PatternMatch[] = history.map((w) => ({
    window: w,
    similarity: cosineSimilarity(currentVector, fpToVector(w.fingerprint)),
    futureReturn5: w.futureReturn5,
    futureReturn10: w.futureReturn10,
  }));
  
  matches.sort((a, b) => b.similarity - a.similarity);
  return matches.slice(0, topK);
}

// === STATISZTIKA A TALÁLATOKRÓL ===

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

export function computePatternStats(matches: PatternMatch[]): PatternStats {
  if (matches.length === 0) {
    return {
      total: 0,
      bullish: 0,
      bearish: 0,
      neutral: 0,
      avgReturn5: 0,
      avgReturn10: 0,
      bestCase5: 0,
      bestCase10: 0,
      worstCase5: 0,
      bestMatchSimilarity: 0,
    };
  }
  
  const returns5 = matches.map((m) => m.futureReturn5);
  const returns10 = matches.map((m) => m.futureReturn10);
  const avgReturn5 = mean(returns5);
  const avgReturn10 = mean(returns10);
  
  return {
    total: matches.length,
    bullish: matches.filter((m) => m.futureReturn5 > 0.005).length,
    bearish: matches.filter((m) => m.futureReturn5 < -0.005).length,
    neutral: matches.filter((m) => Math.abs(m.futureReturn5) <= 0.005).length,
    avgReturn5: parseFloat((avgReturn5 * 100).toFixed(2)),
    avgReturn10: parseFloat((avgReturn10 * 100).toFixed(2)),
    bestCase5: parseFloat((Math.max(...returns5) * 100).toFixed(2)),
    bestCase10: parseFloat((Math.max(...returns10) * 100).toFixed(2)),
    worstCase5: parseFloat((Math.min(...returns5) * 100).toFixed(2)),
    bestMatchSimilarity: parseFloat(matches[0].similarity.toFixed(3)),
  };
}
