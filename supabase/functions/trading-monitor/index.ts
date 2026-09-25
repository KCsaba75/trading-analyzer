// Supabase Edge Function: trading-monitor
// Bejárja a watchlist-et, elemzi a tickereket, és Telegram üzenetet küld, ha BUY/SELL döntés születik.
// A user stratégiáját is figyelembe veszi (max nyitott pozíciók, position size).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = Deno.env.get('TELEGRAM_CHAT_ID');
const REQUESTY_API_KEY = Deno.env.get('REQUESTY_API_KEY');

// Debug logok
console.log('SUPABASE_URL: ' + (SUPABASE_URL ? 'set' : 'NOT SET'));
console.log('SUPABASE_SERVICE_ROLE_KEY: ' + (SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'NOT SET'));
console.log('TELEGRAM_BOT_TOKEN: ' + (TELEGRAM_BOT_TOKEN ? 'set' : 'NOT SET'));
console.log('TELEGRAM_CHAT_ID: ' + (TELEGRAM_CHAT_ID ? 'set' : 'NOT SET'));

interface WatchlistItem {
  id: string;
  ticker: string;
  timeframe: string;
  last_alert_at: string | null;
}

interface ActiveStrategy {
  initial_capital: number;
  risk_level: string;
  max_open_positions: number;
  position_size_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  max_daily_trades: number;
}

interface OpenPosition {
  ticker: string;
  direction: 'BUY' | 'SELL';
  entry_price: number;
  quantity: number;
}

interface AnalysisResult {
  ticker: string;
  current_price: number;
  weighted_score: number;
  jev_decision: 'BUY' | 'SELL' | 'HOLD';
  jev_confidence: number;
  jev_reasoning: string;
  pattern_stats?: { bullish: number; total: number; avgReturn5: number; avgReturn10: number; };
  trade_setup?: { entry: number; stop_loss: number; take_profit_1: number; take_profit_2: number; hold_time: string; risk_reward_ratio: number; position_size_pct: number; rationale: string; narrative: string; };
}

async function getWatchlist(): Promise<WatchlistItem[]> {
  try {
    const url = SUPABASE_URL + '/rest/v1/watchlist?is_active=eq.true&select=id,ticker,timeframe,last_alert_at';
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) {
      console.error('Failed to fetch watchlist: ' + resp.status);
      return [];
    }
    return await resp.json();
  } catch (e) {
    console.error('Error fetching watchlist: ' + e.message);
    return [];
  }
}

async function getActiveStrategy(): Promise<ActiveStrategy | null> {
  try {
    const url = SUPABASE_URL + '/rest/v1/strategies?is_active=eq.true&select=*&limit=1';
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) {
      console.error('Failed to fetch strategy: ' + resp.status);
      return null;
    }
    const data = await resp.json();
    return data.length > 0 ? data[0] : null;
  } catch (e) {
    console.error('Error fetching strategy: ' + e.message);
    return null;
  }
}

async function getOpenPositions(): Promise<OpenPosition[]> {
  try {
    const url = SUPABASE_URL + '/rest/v1/positions?status=eq.open&select=ticker,direction,entry_price,quantity';
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) {
      console.error('Failed to fetch positions: ' + resp.status);
      return [];
    }
    return await resp.json();
  } catch (e) {
    console.error('Error fetching positions: ' + e.message);
    return [];
  }
}

async function getDailyTradeCount(): Promise<number> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const url = SUPABASE_URL + '/rest/v1/positions?created_at=gte.' + today + '&select=id';
    const resp = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY
      }
    });
    if (!resp.ok) return 0;
    const data = await resp.json();
    return data.length;
  } catch (e) {
    return 0;
  }
}

async function analyze(ticker: string, timeframe: string): Promise<AnalysisResult | null> {
  try {
    const url = SUPABASE_URL + '/functions/v1/analyze-stock';
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ticker: ticker, timeframe: timeframe })
    });
    if (!resp.ok) {
      console.error('Failed to analyze ' + ticker + ': ' + resp.status);
      return null;
    }
    return await resp.json();
  } catch (e) {
    console.error('Error analyzing ' + ticker + ': ' + e.message);
    return null;
  }
}

async function sendTelegram(chatId: string, message: string) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set, cannot send message');
    return;
  }
  try {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
    const resp = await fetch(url, {
      timeout: 10000,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
    if (!resp.ok) {
      console.error('Failed to send Telegram message: ' + resp.status);
    }
  } catch (e) {
    console.error('Error sending Telegram message: ' + e.message);
  }
}

async function openPosition(ticker: string, direction: 'BUY' | 'SELL', entryPrice: number, quantity: number, strategy: ActiveStrategy): Promise<boolean> {
  try {
    const url = SUPABASE_URL + '/rest/v1/positions';
    const positionValue = strategy.initial_capital * (strategy.position_size_pct / 100);
    // Pozíció méret USD-ben tárolva, és take_profit szintek kiszámítása
    const sl = direction === 'BUY' ? entryPrice * (1 - strategy.stop_loss_pct / 100) : entryPrice * (1 + strategy.stop_loss_pct / 100);
    const tp1 = direction === 'BUY' ? entryPrice * (1 + strategy.take_profit_pct * 0.5 / 100) : entryPrice * (1 - strategy.take_profit_pct * 0.5 / 100);
    const tp2 = direction === 'BUY' ? entryPrice * (1 + strategy.take_profit_pct / 100) : entryPrice * (1 - strategy.take_profit_pct / 100);
    const tp3 = direction === 'BUY' ? entryPrice * (1 + strategy.take_profit_pct * 2 / 100) : entryPrice * (1 - strategy.take_profit_pct * 2 / 100);
    const rr = Math.abs(tp1 - entryPrice) / Math.abs(entryPrice - sl);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ticker: ticker,
        strategy_id: strategy.id,
        decision: direction,
        confidence: 0.7,
        timeframe: '15m',
        entry_price: entryPrice,
        stop_loss: sl,
        take_profit_1: tp1,
        take_profit_2: tp2,
        take_profit_3: tp3,
        position_size: positionValue,
        risk_reward_ratio: rr,
        status: 'pending',
        reasoning: 'Auto-detected by trading-monitor (score + Jev AI)'
      })
    });
    if (!resp.ok) {
      console.error('Failed to open position: ' + resp.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Error opening position: ' + e.message);
    return false;
  }
}

async function updateLastAlert(id: string) {
  try {
    const url = SUPABASE_URL + '/rest/v1/watchlist?id=eq.' + encodeURIComponent(id);
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ last_alert_at: new Date().toISOString() })
    });
    if (!resp.ok) {
      console.error('Failed to update last_alert_at: ' + resp.status);
    }
  } catch (e) {
    console.error('Error updating last_alert_at: ' + e.message);
  }
}

// US piaci nyitvatartás ellenőrzése (NYSE/NASDAQ)
// UTC idő alapján:
// - Pre-market: hétköznap 13:30 - 14:30 UTC
// - Regular hours: hétköznap 14:30 - 21:00 UTC
// - After hours: hétköznap 21:00 - 00:00 UTC
// - Zárva: hétköznap 00:00 - 13:30 UTC + hétvégén
function isMarketOpen(): { open: boolean; reason: string; nextOpen?: string } {
  const now = new Date();
  const hourUTC = now.getUTCHours();
  const minuteUTC = now.getUTCMinutes();
  const dayUTC = now.getUTCDay(); // 0 = vasárnap, 6 = szombat, 1-5 = hétköznap
  const timeInMinutes = hourUTC * 60 + minuteUTC;
  const marketOpenMin = 13 * 60 + 30; // 13:30 UTC
  const marketCloseMin = 21 * 60;      // 21:00 UTC

  // Hétvége: szombat (6) egész nap, vasárnap (0) egész nap
  if (dayUTC === 6) {
    return { open: false, reason: 'Hétvége (szombat) - piac zárva' };
  }
  if (dayUTC === 0 && timeInMinutes < 23 * 60) {
    return { open: false, reason: 'Vasárnap délelőtt - piac zárva' };
  }

  // Hétköznap (1-5) vagy péntek este
  // Először ellenőrizzük a péntek zárást
  if (dayUTC === 5 && timeInMinutes >= marketCloseMin) {
    return { open: false, reason: 'Péntek este 21:00 UTC után - piac zárva hétvégén' };
  }

  // Általános hétköznap ellenőrzés: 13:30 - 21:00 UTC
  if (dayUTC >= 1 && dayUTC <= 5) {
    if (timeInMinutes < marketOpenMin) {
      return { open: false, reason: `Hétköznap ${(marketOpenMin / 60).toFixed(2).replace('.', ':')} UTC előtt - piac zárva` };
    }
    if (timeInMinutes >= marketCloseMin && dayUTC !== 5) {
      // After hours hétköznap (kivéve péntek)
      // Ha 21:00 - 23:59 UTC, akkor after hours NYITVA
      if (timeInMinutes < 24 * 60) {
        return { open: true, reason: 'After hours (16:00-20:00 ET)' };
      }
      return { open: false, reason: 'Éjszaka - piac zárva' };
    }
    if (timeInMinutes >= marketCloseMin && dayUTC === 5) {
      return { open: false, reason: 'Péntek 21:00 UTC után - piac zárva' };
    }
  }

  // Nyitvatartási időszakok (13:30 - 21:00 UTC)
  if (timeInMinutes >= marketOpenMin && timeInMinutes < 14 * 60 + 30) {
    return { open: true, reason: 'Pre-market (04:00-09:30 ET)' };
  }
  if (timeInMinutes >= 14 * 60 + 30 && timeInMinutes < marketCloseMin) {
    return { open: true, reason: 'Regular hours (09:30-16:00 ET)' };
  }

  return { open: false, reason: 'Piac zárva (UTC idő: ' + now.toISOString() + ')' };
}

serve(async (req) => {
  console.log('Trading monitor started');

  // Piaci nyitvatartás ellenőrzése
  const marketStatus = isMarketOpen();
  if (!marketStatus.open) {
    console.log('Market closed: ' + marketStatus.reason + ', skipping analysis');
    return new Response(JSON.stringify({
      skipped: true,
      reason: marketStatus.reason,
      market_closed: true,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  console.log('Market status: ' + marketStatus.reason);

  // Stratégia és nyitott pozíciók lekérése
  const strategy = await getActiveStrategy();
  if (!strategy) {
    console.log('No active strategy found, skipping analysis');
    return new Response(JSON.stringify({ error: 'No active strategy' }), { headers: { 'Content-Type': 'application/json' } });
  }
  
  const openPositions = await getOpenPositions();
  const dailyTradeCount = await getDailyTradeCount();
  const openTickers = new Set(openPositions.map(p => p.ticker));
  
  const watchlist = await getWatchlist();
  const alertsSent = [];
  
  if (!TELEGRAM_CHAT_ID) {
    console.error('TELEGRAM_CHAT_ID not set, cannot send alerts');
    return new Response(JSON.stringify({ error: 'TELEGRAM_CHAT_ID not set' }), { headers: { 'Content-Type': 'application/json' } });
  }

  for (const item of watchlist) {
    // Anti-spam: max 1 alert / 30 perc / ticker
    if (item.last_alert_at) {
      const lastAlert = new Date(item.last_alert_at);
      if (Date.now() - lastAlert.getTime() < 30 * 60 * 1000) {
        console.log('Skipping ' + item.ticker + ' - alert sent recently');
        continue;
      }
    }

    // Ha már van nyitott pozíció ezen a ticker-en, nem nyitunk újat
    if (openTickers.has(item.ticker)) {
      console.log('Skipping ' + item.ticker + ' - already has open position');
      continue;
    }

    // Ha elértük a max napi tranzakciót, nem nyitunk újat
    if (dailyTradeCount >= strategy.max_daily_trades) {
      console.log('Skipping ' + item.ticker + ' - daily trade limit reached');
      continue;
    }

    // Ha elértük a max nyitott pozíciót, nem nyitunk újat
    if (openPositions.length >= strategy.max_open_positions) {
      console.log('Skipping ' + item.ticker + ' - max open positions reached');
      continue;
    }

    const result = await analyze(item.ticker, item.timeframe);
    if (!result) continue;

    // Csak BUY/SELL esetén küldünk
    if (result.jev_decision !== 'BUY' && result.jev_decision !== 'SELL') {
      console.log('No strong signal for ' + item.ticker + ' (' + result.jev_decision + '), skipping');
      continue;
    }
    
    // Erős jel filter: csak ha a score elég magas VAGY a Jev konfidencia magas
    // 0.3 a score küszöb, vagy 0.6 a Jev konfidencia küszöb
    const strongScore = Math.abs(result.weighted_score) >= 0.3;
    const strongJev = result.jev_confidence >= 0.6;
    if (!strongScore && !strongJev) {
      console.log('Signal for ' + item.ticker + ' is too weak (score: ' + result.weighted_score.toFixed(3) + ', jev: ' + (result.jev_confidence * 100).toFixed(0) + '%), skipping');
      continue;
    }

    // Pozíció méret számítása a stratégia alapján
    const positionValue = strategy.initial_capital * (strategy.position_size_pct / 100);
    const quantity = positionValue / result.current_price;
    
    // Pozíció megnyitása az adatbázisban
    const opened = await openPosition(item.ticker, result.jev_decision, result.current_price, quantity, strategy);
    if (!opened) {
      console.log('Failed to open position for ' + item.ticker);
      continue;
    }
    
    // Telegram üzenet küldése
    const emoji = result.jev_decision === 'BUY' ? '🟢' : '🔴';
    const ts = result.trade_setup;
    const ps = result.pattern_stats;
    
    let message = emoji + ' <b>' + result.jev_decision + ' ALERT</b> — ' + item.ticker + ' (' + result.timeframe + ')\n\n';
    message += '💰 Ár: <b>$' + result.current_price.toFixed(2) + '</b>\n';
    message += '📊 Score: ' + result.weighted_score.toFixed(3) + ' (Jev: <b>' + (result.jev_confidence * 100).toFixed(0) + '%</b>)\n';
    message += '💼 Pozíció: $' + positionValue.toFixed(2) + ' (' + quantity.toFixed(4) + ' ' + item.ticker + ')\n';

    if (ts) {
      message += '\n📍 Entry: $' + ts.entry.toFixed(2) + '\n';
      message += '🛑 SL: $' + ts.stop_loss.toFixed(2) + '\n';
      message += '🎯 TP1: $' + ts.take_profit_1.toFixed(2) + '\n';
      message += '🎯 TP2: $' + ts.take_profit_2.toFixed(2) + '\n';
      message += '⏰ Hold: ' + ts.hold_time + '\n';
    }

    if (ps && ps.total > 0) {
      message += '\n🧬 Pattern (60 nap 15m): ' + ps.bullish + '/' + ps.total + ' bullish, +5h átlag: ' + ps.avgReturn5 + '%\n';
    }

    message += '\n<i>' + (result.jev_reasoning || '') + '</i>\n\n';
    message += '⏰ ' + new Date().toLocaleString('hu-HU');
    
    await sendTelegram(TELEGRAM_CHAT_ID, message);
    await updateLastAlert(item.id);
    alertsSent.push({ ticker: item.ticker, decision: result.jev_decision, entry: result.current_price, quantity: quantity });
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('Trading monitor finished. Alerts sent: ' + alertsSent.length);
  return new Response(JSON.stringify({ 
    checked_tickers: watchlist.length,
    open_positions: openPositions.length,
    daily_trades: dailyTradeCount,
    alerts_sent: alertsSent.length,
    alerts: alertsSent
  }), { headers: { 'Content-Type': 'application/json' } });
});
