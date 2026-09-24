// _helpers/tradeSetup.ts
// A Trade Setup-ot a Jev AI végzi (második hívás), mert a Gemini API key még nincs beállítva
// A Jev képes JSON-ben strukturált választ adni a 'content' mezőben, response_format nélkül

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

const JEV_TRADE_SETUP_PROMPT = (ticker: string, score: number, atr: number, price: number, technical: string, pattern: string) => `Te egy profi day trader vagy. Adj KONKRÉT trade setup-ot JSON formátumban.

TICKER: ${ticker} | Jelenlegi ár: $${price} | ATR: $${atr}
Score: ${score > 0 ? '+' : ''}${score}

=== TECHNICAL INDICATORS ===
${technical}

=== HISTORICAL PATTERN ===
${pattern}

SZABÁLYOK:
- Ha score > +0.05: BULLISH (long) - entry pullback
- Ha score < -0.05: BEARISH (short) - entry rally
- Stop-loss: 1.5x ATR
- TP1: 1.5x kockázat
- TP2: 2.5x kockázat
- Position size: 1-3%

VÁLASZ CSAK JSON (semmi más szöveg):
{
  "entry": <szám>,
  "stop_loss": <szám>,
  "take_profit_1": <szám>,
  "take_profit_2": <szám>,
  "hold_time": "<pl. 2-4 óra>",
  "rationale": "<1-2 mondat indoklás>",
  "narrative": "<3-4 mondat részletes leírás>",
  "risk_reward_ratio": <szám>,
  "position_size_pct": <1-5>
}`;

export async function generateTradeSetup(
  ticker: string,
  weightedScore: number,
  votes: Array<{ name: string; signal: string; value: number | string; reason: string }>,
  patternStats: {
    total: number;
    bullish: number;
    bearish: number;
    neutral: number;
    avgReturn5: number;
    avgReturn10: number;
    bestCase5: number;
    worstCase5: number;
    bestMatchSimilarity: number;
  },
  currentPrice: number,
  atr: number
): Promise<TradeSetup | null> {
  const apiKey = Deno.env.get('REQUESTY_API_KEY');
  if (!apiKey) {
    console.warn('REQUESTY_API_KEY nincs beállítva a trade setuphoz');
    return fallbackTradeSetup(weightedScore, currentPrice, atr, weightedScore > 0 ? 'BUY' : 'SELL');
  }

  try {
    const technical = votes
      .filter(v => v.signal !== 'neutral')
      .slice(0, 8)
      .map(v => `${v.name}: ${v.signal} (${v.value}) - ${v.reason || ''}`)
      .join('\n');
    
    const pattern = patternStats.total > 0
      ? `${patternStats.total} hasonló ablak 60 napból. Bullish: ${patternStats.bullish}/${patternStats.total}. Átlag +5h: ${patternStats.avgReturn5}%. Legjobb eset: +${patternStats.bestCase5}%.`
      : 'Nincs elég pattern adat';

    const prompt = JEV_TRADE_SETUP_PROMPT(ticker, weightedScore, atr, currentPrice, technical, pattern);

    const resp = await fetch('https://router.requesty.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'typesafe/jev-1.13.0',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.4,
      }),
    });

    if (!resp.ok) {
      console.error(`Jev trade setup: HTTP ${resp.status}`);
      return fallbackTradeSetup(weightedScore, currentPrice, atr, weightedScore > 0 ? 'BUY' : 'SELL');
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return fallbackTradeSetup(weightedScore, currentPrice, atr, weightedScore > 0 ? 'BUY' : 'SELL');
    }

    // JSON parse - először közvetlenül, ha nem megy, akkor kivonat
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      try {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          parsed = JSON.parse(content.substring(firstBrace, lastBrace + 1));
        }
      } catch {
        console.error('Jev trade setup JSON parse failed:', content.substring(0, 200));
        return fallbackTradeSetup(weightedScore, currentPrice, atr, weightedScore > 0 ? 'BUY' : 'SELL');
      }
    }

    if (!parsed) return fallbackTradeSetup(weightedScore, currentPrice, atr, weightedScore > 0 ? 'BUY' : 'SELL');

    // Validáció és fallback a hiányzó mezőkre
    const isBuy = weightedScore > 0;
    return {
      entry: typeof parsed.entry === 'number' ? parsed.entry : currentPrice,
      stop_loss: typeof parsed.stop_loss === 'number' ? parsed.stop_loss : (isBuy ? currentPrice - atr * 1.5 : currentPrice + atr * 1.5),
      take_profit_1: typeof parsed.take_profit_1 === 'number' ? parsed.take_profit_1 : (isBuy ? currentPrice + atr * 2.5 : currentPrice - atr * 2.5),
      take_profit_2: typeof parsed.take_profit_2 === 'number' ? parsed.take_profit_2 : (isBuy ? currentPrice + atr * 4 : currentPrice - atr * 4),
      hold_time: parsed.hold_time || '2-4 óra',
      rationale: parsed.rationale || 'Score-alapú beállítás',
      narrative: parsed.narrative || '',
      risk_reward_ratio: typeof parsed.risk_reward_ratio === 'number' ? parsed.risk_reward_ratio : 1.5,
      position_size_pct: typeof parsed.position_size_pct === 'number' ? parsed.position_size_pct : 2,
    };
  } catch (e) {
    console.error('Jev trade setup error:', String(e));
    return fallbackTradeSetup(weightedScore, currentPrice, atr, weightedScore > 0 ? 'BUY' : 'SELL');
  }
}

// Score-alapú fallback, ha a Jev sem elérhető
export function fallbackTradeSetup(
  weightedScore: number,
  currentPrice: number,
  atr: number,
  decision: 'BUY' | 'SELL' | 'HOLD'
): TradeSetup | null {
  if (decision === 'HOLD') return null;
  
  const isBuy = decision === 'BUY';
  const entry = isBuy ? currentPrice * 0.997 : currentPrice * 1.003;
  const stopLoss = isBuy ? entry - atr * 1.5 : entry + atr * 1.5;
  const tp1 = isBuy ? entry + atr * 2.5 : entry - atr * 2.5;
  const tp2 = isBuy ? entry + atr * 4 : entry - atr * 4;
  
  return {
    entry: parseFloat(entry.toFixed(2)),
    stop_loss: parseFloat(stopLoss.toFixed(2)),
    take_profit_1: parseFloat(tp1.toFixed(2)),
    take_profit_2: parseFloat(tp2.toFixed(2)),
    hold_time: '3-5 óra',
    rationale: 'Score-alapú fallback (Jev nem elérhető)',
    narrative: 'ATR és score alapján kiszámított konzervatív trade setup.',
    risk_reward_ratio: 1.67,
    position_size_pct: 2,
  };
}
